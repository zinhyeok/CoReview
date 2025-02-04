var selectedKeywords = new Set(); // 선택된 키워드를 관리할 Set

document.addEventListener("DOMContentLoaded", () => {
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      const tabId = tabs[0].id;
      chrome.runtime.sendMessage({ action: "getState", tabId: tabId }, (response) => {
        if (response && response.state) {
          currentState = response.state;
          changeState(currentState, response.jsonData);
        } else {
          console.warn("❌ 상태를 복원할 수 없습니다. 기본 상태로 설정합니다.");
          response.state = "start-screen";
          changeState("start-screen");
        }
        });
      }
    });

  document.getElementById("fast-btn").addEventListener("click", () => {
    startCrawling(90, true, "fast"); 
    changeState("loading-screen");
  });

  document.getElementById("slow-btn").addEventListener("click", () => {
    startCrawling(10000, false, "slow"); 
    changeState("loading-screen");
  });
});

function saveState(state, jsonData = null) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      const tabId = tabs[0].id;
      // 상태와 jsonData를 함께 전송
      chrome.runtime.sendMessage({ action: "setState", tabId: tabId, state: state, jsonData: jsonData }, (response) => {
        if (response.success) {
          console.log("✅ 상태와 데이터가 성공적으로 저장되었습니다.");
        } else {
          console.error("❌ 상태 저장 실패:", response.error);
        }
      });
    }
  });
}

function changeState(state, jsonData = null) {
  currentState = state;

  // jsonData가 있는 경우 함께 저장
  saveState(state, jsonData);

  // 화면 전환
  document.getElementById("start-screen").style.display = "none";
  document.getElementById("loading-screen").style.display = "none";
  document.getElementById("keywords-screen").style.display = "none";

  if (state === "keywords-screen") {
    document.getElementById("keywords-screen").style.display = "block";
    if (jsonData) {
      initKeywordScreenEvents(jsonData);  // 화면에 jsonData 렌더링
    }
  } else {
    document.getElementById(state).style.display = "block";
  }
}

function startCrawling(limit, includeLowRatings) {
  showLoadingScreen();

  sendMessageToContentScript(limit, includeLowRatings)
    .then(() => {
      console.log('크롤링 완료')
    })
    .catch(error => {
      console.error("크롤링 중 오류 발생:", error);
    });
}


function sendMessageToContentScript(limit, includeLowRatings) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) {
          reject("No active tab found");
          return;
        }

        // content.js를 실행하는 코드
        chrome.scripting.executeScript(
          {
            target: { tabId: tabs[0].id },
            files: ["scripts/content.js"], // ✅ content.js를 실행
          },
          () => {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: "startCrawling",
              limit: limit,
              includeLowRatings: includeLowRatings,
            });
            resolve();
          }
        );
      });
    } catch (error) {
      reject(error);
    }
  });
}


function showLoadingScreen() {
  document.getElementById("start-screen").style.display = "none";
  // 미리 로드
  const loadingImg = new Image();
  loadingImg.src = "../imgs/loading.gif";

  // 렌더링 보장
  document.getElementById("loading-screen").style.display = "block";
  setTimeout(() => {
    document.getElementById("loading-screen").style.opacity = "1";
  }, 0);
}


function downloadCSV(data) {
  const csvContent =
    "data:text/csv;charset=utf-8," +
    "이름,작성일자,평점,리뷰 내용\n" +
    data.map(r => `"${r.userName}","${r.date}","${r.rating}","${r.content}"`).join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "crawled_reviews.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function sendToFlask(reviews) {
  try {
    let response = await fetch("http://localhost:8000/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ reviews: reviews })
    });

    if (!response.ok) {
      throw new Error(`서버 오류: ${response.status}`);
    }

    let data = await response.json();
    
    // ✅ 분석 결과 콘솔 출력
    console.log("🔍 분석 결과 저장 완료:", data);

    // ✅ 결과를 `localStorage`에 저장
    localStorage.setItem("analysisResults", JSON.stringify(data));

  } catch (error) {
    console.error("❌ Flask 서버 요청 실패:", error);
  }
}

//서버로부터 response 받고 난뒤 코드
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "displayAnalysisResults") {
      const jsonData = request.data;
      changeState("keywords-screen", jsonData)
      initKeywordScreenEvents(jsonData);
      sendResponse({ success: true });
  }
});

function initKeywordScreenEvents(jsonData) {
  renderKeywordCategories(jsonData);
  const organizeBtn = document.getElementById("organize-btn");
  //btn 클릭시 상세 리뷰 정리
  organizeBtn.addEventListener("click", () => {
    renderReviews(jsonData);
  });
}

//rendering json respond
function renderKeywordCategories(data) {
  const container = document.getElementById("keyword-categories");
  container.innerHTML = ""; // 기존 내용을 초기화
  // 형용사 키워드 섹션 추가
  const adjectiveSection = createCategorySection("반응", data.adjectives);
  container.appendChild(adjectiveSection);

  // 명사 키워드 섹션 추가
  const nounSection = createCategorySection("특징", data.nouns);
  container.appendChild(nounSection);
}

function createCategorySection(title, keywords) {
  const section = document.createElement("div");
  section.className = "category-section";

  const sectionTitle = document.createElement("h4");
  sectionTitle.innerText = title;
  section.appendChild(sectionTitle);

  const keywordList = document.createElement("div");
  keywordList.className = "keyword-list";

  for (const [keyword, details] of Object.entries(keywords)) {
    const keywordItem = document.createElement("div");
    keywordItem.className = "keyword-item";
    keywordItem.innerHTML = `${keyword} <span>(${details.count})</span>`;

    keywordItem.addEventListener("click", () => toggleKeywordSelection(keyword, keywordItem));
    keywordList.appendChild(keywordItem);
  }

  section.appendChild(keywordList);
  return section;
}

function toggleKeywordSelection(keyword, keywordItem) {
  if (selectedKeywords.has(keyword)) {
    selectedKeywords.delete(keyword);
    keywordItem.classList.remove("selected");
    removeKeyword(keyword);
  } else {
    selectedKeywords.add(keyword);
    keywordItem.classList.add("selected");
    addKeyword(keyword);
  }

  updateOrganizeButtonState();
}

function addKeyword(keyword) {
  const keywordElement = document.createElement("div");
  const selectedContainer = document.getElementById("selected-keywords");

  keywordElement.className = "selected-keyword";
  keywordElement.innerHTML = `${keyword} <button class="remove-btn">X</button>`;

  // 이벤트 리스너 등록
  keywordElement.querySelector(".remove-btn").addEventListener("click", () => {
    selectedKeywords.delete(keyword);
    
    // `.keyword-item.selected` 요소 중에서 키워드가 포함된 요소 찾기
    const keywordItems = document.querySelectorAll(".keyword-item.selected");
    keywordItems.forEach((item) => {
      if (item.textContent.includes(keyword)) {
        item.classList.remove("selected");
      }
    });

    // 선택된 키워드 요소 제거
    keywordElement.remove();
    updateOrganizeButtonState();
  });

  selectedContainer.appendChild(keywordElement);
}


function removeKeyword(keyword) {
  const selectedContainer = document.getElementById("selected-keywords");
  const keywordElements = document.querySelectorAll(".keyword-item.selected");

  // 요소 중에서 텍스트가 해당 키워드와 일치하는 것을 찾아 제거
  keywordElements.forEach((element) => {
    if (element.textContent.trim().startsWith(keyword)) {
      element.classList.remove("selected");
    }
  });

  const keywordElement = selectedContainer.querySelector(`.selected-keyword`);
  if (keywordElement && keywordElement.textContent.includes(keyword)) {
    keywordElement.remove();
  }
}

function updateOrganizeButtonState() {
  const organizeBtn = document.getElementById("organize-btn");
  if (selectedKeywords.size > 0) {
    organizeBtn.classList.add("active");
    organizeBtn.disabled = false;
  } else {
    organizeBtn.classList.remove("active");
    organizeBtn.disabled = true;
  }
}

function renderReviews(data) {
  const reviewsContainer = document.getElementById("review-list");
  keywords = Array.from(selectedKeywords);
  reviewsContainer.innerHTML = ""; // 기존 리뷰 초기화
  keywords.forEach((keyword) => {
    if (data.adjectives[keyword]) {
      const { rating, examples } = data.adjectives[keyword];

      // 키워드 제목 및 리뷰 섹션 추가
      const reviewHeader = document.createElement("div");
      reviewHeader.className = "review-header";
      reviewHeader.innerHTML = `<strong>${keyword}</strong> <span class="rating">(${rating.toFixed(1)})</span>`;
      reviewsContainer.appendChild(reviewHeader);

      // 예시 문장 렌더링
      examples.forEach((example) => {
        const reviewItem = document.createElement("div");
        reviewItem.className = "review-item";
        reviewItem.innerHTML = highlightKeyword(example, keyword);
        reviewsContainer.appendChild(reviewItem);
      });
    }
  });
}

function highlightKeyword(text, keyword) {
  const regex = new RegExp(`(${keyword})`, "gi");
  return text.replace(regex, '<span class="highlight">$1</span>');
}

//오류 메세지 retry btn
document.getElementById("retry-btn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "retrySendData" }, (response) => {
    if (response && response.success) {
      console.log("🔄 재전송이 시작되었습니다.");
    } else {
      console.warn("❌ 재전송할 데이터가 없습니다.");
    }
  });
});

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "showErrorPage") {
    document.getElementById("default-screen").style.display = "none";
    document.getElementById("error-screen").style.display = "block";
  }
});