document.addEventListener("DOMContentLoaded", () => {
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      const tabId = tabs[0].id;
      chrome.runtime.sendMessage({ action: "getState", tabId: tabId }, (response) => {
        if (response && response.state) {
          currentState = response.state;
          changeState(currentState);
        } else {
          console.warn("❌ 상태를 복원할 수 없습니다. 기본 상태로 설정합니다.");
          response.state = "start-screen";
          changeState("start-screen");
        }
        });
      }
    });

  document.getElementById("fast-btn").addEventListener("click", () => {
    startCrawling(90, true);
    changeState("loading-screen");
  });

  document.getElementById("slow-btn").addEventListener("click", () => {
    startCrawling(Infinity, false);
    changeState("loading-screen");
  });

});

function saveState(state) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      const tabId = tabs[0].id;
      // 탭 ID와 상태를 함께 전송
      chrome.runtime.sendMessage({ action: "setState", tabId: tabId, state: state }, (response) => {
        if (response.success) {
          console.log("✅ 상태가 성공적으로 저장되었습니다.");
        } else {
          console.error("❌ 상태 저장 실패:", response.error);
        }
      });
    }
  });
}

function changeState(state) {
  currentState = state;
  saveState(state);
  // 모든 화면 숨기기
  document.getElementById("start-screen").style.display = "none";
  document.getElementById("loading-screen").style.display = "none";
  document.getElementById("keywords-screen").style.display = "none";

  // 상태에 따라 적절한 화면 표시
  document.getElementById(state).style.display = "block";
}

// function showReviewState(reviewState) {
//   document.getElementById("loading-reviews").style.display = "none";
//   document.getElementById("selected-reviews").style.display = "none";

//   if (reviewState === "loading-reviews") {
//     document.getElementById("loading-reviews").style.display = "block";
//   } else if (reviewState === "selected-reviews") {
//     document.getElementById("selected-reviews").style.display = "block";
//   }
// }

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
      changeState("keywords-screen")
      //HTML 요소 업데이트 필요
      // document.getElementById("analysis-results").innerText = JSON.stringify(request.data, null, 2);
      const jsonData = JSON.stringify(request.data, null, 2);
      initKeywordScreenEvents(jsonData);
      // displayReviews(request.data.reviews);
      sendResponse({ success: true });
  }
});

function initKeywordScreenEvents(jsonData) {
  const selectedKeywords = new Set(); // 선택된 키워드를 관리할 Set
  const organizeBtn = document.getElementById("organize-btn");
  
  renderKeywordCategories(jsonData, selectedKeywords);
  //btn 클릭시 상세 리뷰 정리
  organizeBtn.addEventListener("click", () => {
    renderReviews(jsonData, selectedKeywords);
  });
}

//rendering json respond
function renderKeywordCategories(data, selectedKeywords) {
  const container = document.getElementById("keyword-categories");
  container.innerHTML = ""; // 기존 내용을 초기화
  // 형용사 키워드 섹션 추가
  const adjectiveSection = createCategorySection("반응", data.adjectives, selectedKeywords);
  container.appendChild(adjectiveSection);

  // 명사 키워드 섹션 추가
  const nounSection = createCategorySection("특징", data.nouns, selectedKeywords);
  container.appendChild(nounSection);
}

function createCategorySection(title, keywords, selectedKeywords) {
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

    keywordItem.addEventListener("click", () => toggleKeywordSelection(keyword, keywordItem, selectedKeywords));
    keywordList.appendChild(keywordItem);
  }

  section.appendChild(keywordList);
  return section;
}

function toggleKeywordSelection(keyword, keywordItem, selectedKeywords) {
  if (selectedKeywords.has(keyword)) {
    selectedKeywords.delete(keyword);
    keywordItem.classList.remove("selected");
    removeKeyword(keyword, selectedKeywords);
  } else {
    selectedKeywords.add(keyword);
    keywordItem.classList.add("selected");
    addKeyword(keyword, selectedKeywords);
  }

  updateOrganizeButtonState(selectedKeywords);
}

function addKeyword(keyword, selectedKeywords) {
  const keywordElement = document.createElement("div");
  const selectedContainer = document.getElementById("selected-keywords");

  keywordElement.className = "selected-keyword";
  keywordElement.innerHTML = `${keyword} <button class="remove-btn">X</button>`;

  keywordElement.querySelector(".remove-btn").addEventListener("click", () => {
    selectedKeywords.delete(keyword);
    document.querySelector(`.keyword-item.selected:contains('${keyword}')`).classList.remove("selected");
    keywordElement.remove();
    updateOrganizeButtonState();
  });

  selectedContainer.appendChild(keywordElement);
}

function removeKeyword(keyword, selectedKeywords) {
  const selectedContainer = document.getElementById("selected-keywords");
  const keywordElement = selectedContainer.querySelector(`.selected-keyword:contains('${keyword}')`);
  if (keywordElement) keywordElement.remove();
}

function updateOrganizeButtonState(selectedKeywords) {
  if (selectedKeywords.size > 0) {
    organizeBtn.classList.add("active");
    organizeBtn.disabled = false;
  } else {
    organizeBtn.classList.remove("active");
    organizeBtn.disabled = true;
  }
}

function renderReviews(data, keywords) {
  const reviewsContainer = document.getElementById("review-list");
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