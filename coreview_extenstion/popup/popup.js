var selectedKeywords = new Set(); // 선택된 키워드를 관리할 Set
var crawlResults;

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
      console.log("🚀 fast-btn 클릭됨! startCrawling 실행: mode=fast");
      startCrawling(90, true, "fast"); 
      changeState("loading-screen");
  });
  
  document.getElementById("slow-btn").addEventListener("click", () => {
      console.log("🐢 slow-btn 클릭됨! startCrawling 실행: mode=slow");
      startCrawling(10000, false, "slow"); 
      changeState("loading-screen");
  });

  document.getElementById("selected-keywords").addEventListener("click", (event) => {
    if (event.target.classList.contains("remove-btn")) {
      const keywordElement = event.target.closest(".selected-keyword");
      if (keywordElement) {
        const keyword = keywordElement.textContent.trim().split(" ")[0];  // 키워드 추출
        // 키워드 삭제 및 화면 업데이트
        // const keyword = keywordElement.getAttribute("data-keyword");
        selectedKeywords.delete(keyword);
        removeKeyword(keyword);
      }
    }
  });

  document.getElementById("keyword-categories").addEventListener("click", (event) => {
    const keywordItem = event.target.closest(".keyword-item");
    if (keywordItem) {
      toggleKeywordSelection(keywordItem.dataset.keyword, keywordItem);
    }
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
  document.getElementById("error-screen").style.display = "none";
  
  if (state === "keywords-screen") {
    document.getElementById("keywords-screen").style.display = "block";
    if (jsonData) {
      initKeywordScreenEvents(jsonData);  // 화면에 jsonData 렌더링
    }
  } else {
    document.getElementById(state).style.display = "block";
  }
}

function startCrawling(limit, includeLowRatings, mode) {
  showLoadingScreen();

  sendMessageToContentScript(limit, includeLowRatings ,mode)
    .then(() => {
      console.log('크롤링 완료')
    })
    .catch(error => {
      console.error("크롤링 중 오류 발생:", error);
    });
}


function sendMessageToContentScript(limit, includeLowRatings, mode) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) {
          reject("No active tab found");
          return;
        }

        console.log("📨 content.js로 메시지 전달:", { limit, includeLowRatings, mode });

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
              mode: mode, // ✅ mode 전달 확인
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

//서버로부터 분석 response 받고 난뒤 코드
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

//rendering json respond for keyword
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
  sectionTitle.className = 'keyword-type'
  section.appendChild(sectionTitle);

  const keywordList = document.createElement("div");
  keywordList.className = "keyword-list";

  for (const [keyword, details] of Object.entries(keywords)) {
    if (!(details.count > 0)) continue;
    const keywordItem = document.createElement("div");
    keywordItem.className = "keyword-item";
    keywordItem.dataset.keyword = keyword; // 전체 키워드는 data 속성에, 표시는 4자까지
    keywordItem.title = keyword;
    keywordItem.innerHTML = `${keyword.slice(0, 4)} <span>${details.count}</span>`;
    keywordList.appendChild(keywordItem);
  }
  section.appendChild(keywordList);
  return section;
}

//각 키워드 버튼이 클릭 가능하게 + selected시 해당 item 저장 및 제거
function toggleKeywordSelection(keyword, keywordItem) {
  if (selectedKeywords.has(keyword) || document.querySelector(`.selected-keyword[data-keyword='${keyword}']`)) {
    selectedKeywords.delete(keyword);
    keywordItem.classList.remove("selected");
    removeKeyword(keyword);
  } else {
    if (!document.querySelector(`.selected-keyword[data-keyword="${keyword}"]`)){
      selectedKeywords.add(keyword);
      keywordItem.classList.add("selected");
      addKeyword(keyword);
    }
  }
  //활성상태 변환
  updateOrganizeButtonState();
}

//front html에 select keyword를 추가
function addKeyword(keyword) {
  if (document.querySelector(`.selected-keyword[data-keyword='${keyword}']`)){
    return;
  }
  const keywordElement = document.createElement("div");
  const selectedContainer = document.getElementById("selected-keywords");
  keywordElement.className = 'selected-keyword' ;
  keywordElement.id = `selected-${keyword}`;
  keywordElement.innerHTML = `${keyword} <button class="remove-btn">X</button>`;

  selectedContainer.appendChild(keywordElement);
  updateOrganizeButtonState();
}

function removeKeyword(keyword) {
  // `.keyword-item.selected` selected 상태 제거
  document.querySelectorAll(".keyword-item.selected").forEach((item) => {
    if (item.dataset.keyword === keyword) {
      item.classList.remove("selected");
    }
  });

  // `.selected-keyword` UI 제거
  // const selectedContainer = document.getElementById("selected-keywords");
  const keywordElement = document.getElementById(`selected-${keyword}`);
  if (keywordElement) {
    keywordElement.remove();
  }

  // 상태 업데이트 및 리뷰 상세 결과 제거
  updateOrganizeButtonState();
  removeReview(keyword);
}


function removeReview(keyword) {
  const reviewsContainer = document.getElementById("review-list");
  if (!reviewsContainer) {
    console.warn("리뷰 컨테이너가 존재하지 않습니다.");
    return;
  }
  
  const reviewItems = reviewsContainer.querySelectorAll(".review-header, .review-item");
  
  reviewItems.forEach((item) => {
    if (item && item.textContent.toLowerCase().includes(keyword.toLowerCase())) {
      console.log(`🗑️ '${keyword}'가 포함된 리뷰 항목 제거:`, item);
      item.remove();
    }
  });
}


//활성상태 selectedKeywords로 판단 버튼 updates
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
    let reviewData = data.adjectives[keyword] || data.nouns[keyword];  
    if (reviewData) {
      const { rating, examples } = reviewData;
      // 키워드 제목 및 리뷰 섹션 추가
      const reviewHeader = document.createElement("div");
      reviewHeader.className = "review-header";
      reviewHeader.innerHTML = `<strong>${keyword}</strong> <span class="rating"> ${rating.toFixed(1)} <i class="rating-star">★</i></span>`;
      reviewsContainer.appendChild(reviewHeader);

      // 예시 문장 렌더링
      examples.forEach((example) => {
        const reviewItem = document.createElement("div");
        reviewItem.className = "review-item";
        reviewItem.innerHTML = processTextWithKeyword(example, keyword, maxLength = 25);
        reviewsContainer.appendChild(reviewItem);
      });
    }
  });
}

function processTextWithKeyword(text, keyword, maxLength = 100) {
  // 1. 특수문자 제거 (숫자, 알파벳, 한글, 공백은 유지)
  let filterText = text.replace(/[^\w\s가-힣]/g, "");
  const cleanedText = filterText.replace(/\s{2,}/g, " ");

  // 2. 키워드 위치 탐색
  const keywordIndex = cleanedText.toLowerCase().indexOf(keyword.toLowerCase());
  if (keywordIndex !== -1 && cleanedText.length > maxLength) {
    // 3. 키워드 주변 문장 추출
    const sentences = cleanedText.split(/(?<=[.?!])/g);  // 문장 분리 (마침표, 느낌표, 물음표 기준)
    let targetSentence = "";
    // 키워드가 포함된 문장을 찾음
    for (let sentence of sentences) {
      if (sentence.toLowerCase().includes(keyword.toLowerCase())) {
        targetSentence = sentence.trim();
        break;
      }
    }
    // 문장이 너무 길면 자름
    if (targetSentence.length > maxLength) {
      const start = Math.max(0, targetSentence.indexOf(keyword) - Math.floor(maxLength / 2));
      const end = Math.min(targetSentence.length, start + maxLength);
      targetSentence = (start > 0 ? "" : "") + targetSentence.substring(start, end).trim() + (end < targetSentence.length ? "..." : "");
    }
    return highlightKeyword(targetSentence, keyword);
  }
  // 4. 키워드가 없거나 텍스트가 maxLength 이하인 경우 그대로 반환
  return highlightKeyword(cleanedText, keyword);
}

function highlightKeyword(text, keyword) {
  const regex = new RegExp(`(${keyword})`, "gi");
  return text.replace(regex, '<span class="highlight">$1</span>');
}

//error page관련

//크롤링 결과 저장
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "crawlResults") {
      crawlResults = request.data;
      sendResponse({ success: true });
  }
});


document.getElementById("retry-btn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "retrySendData" }, (response) => {
    if (response && response.success) {
      console.log("🔄 재전송이 시작되었습니다.");
    } else {
      console.log("❌ 재전송할 데이터가 없습니다.");
      changeState("start-screen")
    }
  });
});

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "showErrorPage") {
    changeState("error-screen", crawlResults)
  }
});