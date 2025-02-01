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

  document.getElementById("organize-btn").addEventListener("click", () => {
    showReviewState("loading-keyword");

    // 키워드 선택 후 크롤링 요청 및 서버 응답 대기
    chrome.runtime.sendMessage({ action: "startKeywordAnalysis" });
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

  if (state === "keywords-screen") {
    showReviewState("loading-keyword"); // 초기 상태로 설정
  }
}

function showReviewState(reviewState) {
  document.getElementById("loading-keyword").style.display = "none";
  document.getElementById("selected-reviews").style.display = "none";

  if (reviewState === "loading-keyword") {
    document.getElementById("loading-keyword").style.display = "block";
  } else if (reviewState === "selected-reviews") {
    document.getElementById("selected-reviews").style.display = "block";
  }
}

document.getElementById("organize-btn").addEventListener("click", () => {
  showReviewState("loading-keyword");
  // 서버에서 데이터를 받아온 후 상태 변경
  fetchReviewsByKeywords().then(() => {
    showReviewState("selected-reviews");
  });
});


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


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "displayAnalysisResults") {
      showReviewState("selected-reviews");
      //HTML 요소 업데이트 필요
      document.getElementById("analysis-results").innerText = JSON.stringify(request.data, null, 2);
      // displayReviews(request.data.reviews);
      sendResponse({ success: true });
  }
});











// function displayKeywords(keywords) {
//   document.getElementById("loading").style.display = "none";
//   document.getElementById("keywords").style.display = "block";

//   const keywordList = document.getElementById("keyword-list");
//   keywordList.innerHTML = "";
//   keywords.forEach(keyword => {
//     const div = document.createElement("div");
//     div.classList.add("keyword");
//     div.textContent = `${keyword.text} (${keyword.count})`;
//     div.addEventListener("click", () => div.classList.toggle("selected"));
//     keywordList.appendChild(div);
//   });
  
// document.getElementById("organize-btn").addEventListener("click", () => {
//   const selectedKeywords = Array.from(document.querySelectorAll(".keyword.selected")).map(
//     keyword => keyword.textContent.split(" ")[0]
//   );
//   organizeReviews(selectedKeywords);
// });
// }

// function organizeReviews(keywords) {
// showLoadingScreen();
// fetch("http://localhost:5000/organize", {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({ keywords })
// })
//   .then(response => response.json())
//   .then(data => {
//     displayReviews(data.reviews);
//   });
// }

// function displayReviews(reviews) {
// document.getElementById("loading").style.display = "none";
// document.getElementById("reviews").style.display = "block";

// const reviewList = document.getElementById("review-list");
// reviewList.innerHTML = "";
// reviews.forEach(review => {
//   const div = document.createElement("div");
//   div.classList.add("review-item");
//   div.textContent = review.text;
//   reviewList.appendChild(div);
// });
// }
