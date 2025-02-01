var selectedKeywords = new Set(); // 선택된 키워드를 관리할 Set

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
      let jsonData = JSON.stringify(request.data, null, 2);
      jsonData = {
        "adjectives": {
            "아쉬": {
                "count": 3,
                "examples": [
                    "전반적으로 만족스러운 제품이었지만, 몇 가지 아쉬운 점도 있었습니다.#### 장점1.",
                    "뿌리를 넣기에는 공간이 부족해 식물의 건강에 영향을 줄 수 있을 것 같아 아쉬웠습니다.2. **관리의 번거로움**: 수경재배식물 특성상 물을 자주 갈아줘야 하는데, 유리병의 디자인 때문에 물을 붓는 것이 다소 불편했습니다.#### 종합적인 평가전체적으로 1+1 수경재배식물 테이블야자와 스파트필름 모던글라스 세트는 디자인과 가격 면에서 매우 만족스러운 선택이었습니다.",
                    "조금 아쉬웠어요"
                ],
                "rating": 3.67
            },
            "예쁘": {
                "count": 4,
                "examples": [
                    "화병하나입구 쪽이 깨져서 왔네요.교환하기도 귀찮네요.그리고 테이블야자가 시들어 왔어요예쁘질 않네요.",
                    "모종상태좋아요!플라스틱 모종 화분에 배송이됩니다.스노우 사파이어는 뿌리도 깔끔하고 깨끗해서배송되어온 유리병+ 흰자갈 이용해서수경재배 하기로 결정!!(원래가 수경재배 키트인데..;;^^)스마트 필름은 생각보다 모종이 큰거 같아서,토분에 옮겨 심었습니다!계속 꽃이 자라는 수종이어서, 키우는 재미가 있죠!옮겨심으니까 예쁘네요~~~!!❤️여기 모종, 뿌리도 싱싱하고 괜찮네요!스노우 사파이어 일주일만에 금방 새잎이 돋았어요~!수경재배 키트도 깔끔하고요~!배송당시 상태도 좋았습니다.최대한 식물이 다치지 않게 포장 잘해주셨더라구요!잘 키워볼게요❤️",
                    "작아요.백자갈량이 작아서 식물이 잘지지되지 않으니 모양도 예쁘지 않네요.그래도 식물은 나름 싱싱하네요."
                ],
                "rating": 4.25
            },
        },
        "nouns": {
            "마음": {
                "count": 4,
                "examples": [
                    "묘처럼 기분전환 했네요~가끔씩 공허할때 식물보고있음마음이편안해지더라고요~~이상하게도 제가 똥손?이서인지~저에게힘링이되는식물들이잘돌봐줘도자꾸 죽게되는이유는뭘까요?ㅜㅜ수경이라 잘키울수있겠지?하는마음으로 구입했어요우선 아담싸이즈로 잎도풍성하고요~~아주맘에들어하네요 사진보시면 아시겠지만 푸릇푸릇하니~~내맘도푸릇푸릇 힐링되네요참~~~ 포장아이들다치지않게 신문지로 안전하게포장되어 왔어요^^",
                    "한번 구매하고 너무 마음에 들어서 다음날 바로 재구매했어요.",
                    "포장 벗길때까지 마음을 많이 졸였어요 또 잘못되었을까봐요걱정과 달리 좋은 아가들이 왔네요신경써주시고~~ 넘넘 감사합니다 고객 응대 해주실때도 잘 들어주시고 제가 했던말을 여러번 한것  같은데도 친절하게 다 받아주셨어요 보내주신 몬스테라 잘 키울께요~~~"
                ],
                "rating": 5
            },
            "배송": {
                "count": 8,
                "examples": [
                    "**신선한 식물**: 배송된 테이블야자는 매우 싱싱했습니다.",
                    "배송 롯데택배 배송으로 문제없이 도착2.",
                    "모두 좋은 상태로 배송이 되었는데한종류만 유독 살아나지 못하고 썩어버리네요."
                ],
                "rating": 4.75
            },
            "뿌리": {
                "count": 12,
                "examples": [
                    "모종상태좋아요!플라스틱 모종 화분에 배송이됩니다.스노우 사파이어는 뿌리도 깔끔하고 깨끗해서배송되어온 유리병+ 흰자갈 이용해서수경재배 하기로 결정!!(원래가 수경재배 키트인데..;;^^)스마트 필름은 생각보다 모종이 큰거 같아서,토분에 옮겨 심었습니다!계속 꽃이 자라는 수종이어서, 키우는 재미가 있죠!옮겨심으니까 예쁘네요~~~!!❤️여기 모종, 뿌리도 싱싱하고 괜찮네요!스노우 사파이어 일주일만에 금방 새잎이 돋았어요~!수경재배 키트도 깔끔하고요~!배송당시 상태도 좋았습니다.최대한 식물이 다치지 않게 포장 잘해주셨더라구요!잘 키워볼게요❤️",
                    "ㅎㅎㅎ ㅎㅎ저희집 다른 식물과도 잘 어울려요~강추입니다.사용후기6개월이 지난 지금 물속에 있는 뿌리가 썩내요...그래서 다 죽고 테이블야자만 반절 남았네요 ㅎㅎ제가 잘 못 키우는 건가 싶기도 하구요..",
                    "스킨답서스는 뿌리가 진짜 촘촘하고 많더라구요."
                ],
                "rating": 4
            },
            "상태": {
                "count": 10,
                "examples": [
                    "모종상태좋아요!플라스틱 모종 화분에 배송이됩니다.스노우 사파이어는 뿌리도 깔끔하고 깨끗해서배송되어온 유리병+ 흰자갈 이용해서수경재배 하기로 결정!!(원래가 수경재배 키트인데..;;^^)스마트 필름은 생각보다 모종이 큰거 같아서,토분에 옮겨 심었습니다!계속 꽃이 자라는 수종이어서, 키우는 재미가 있죠!옮겨심으니까 예쁘네요~~~!!❤️여기 모종, 뿌리도 싱싱하고 괜찮네요!스노우 사파이어 일주일만에 금방 새잎이 돋았어요~!수경재배 키트도 깔끔하고요~!배송당시 상태도 좋았습니다.최대한 식물이 다치지 않게 포장 잘해주셨더라구요!잘 키워볼게요❤️",
                    "식물 상태는 좋아요.",
                    "테이블 야자만 상태가 양호하고 스마트필름은 얼은것 같은 잎상태로 왔어요 잎이 반정도 안좋네요2주전쯤 다른곳에 주문한 스마트필름은 상태가 좋은걸로 왔는데 상품받고서는 놀랬어요 상태가 너무 안좋아서요겨울철에는 주문하면 안되는 식물인가봐요많이 속상하네요처음 보낼땐 안그랬을것 같은데 배송중에 문제가 생긴듯 합니다 원래대로라면 화요일에 와야하는데 월요일에 도착했어요문제는 제 물건이 토요일날 제가 사는 지역에 오전일찍 도착한걸로 떴어요 물품이 추운곳에 보관된듯 해요 업주께서누 배송시스템을 바꾸셔야 할듯 싶어요고객이 주문하면 하루다음날 바로 받을수 있게요 우선 저는 이것말고도 다른것도 주문했는데.."
                ],
                "rating": 4.5
            },
            "포장": {
                "count": 11,
                "examples": [
                    "포장도 꼼꼼하게 잘해서 만족합니다.잘키워보겠습니다.감사합니다 ~",
                    "포장이 꼼꼼하게 되어 식물들이 싱싱하게 잘 배송 되었어요 잘키워 볼게요",
                    "식물들 싱싱하고 꼼꼼히 포장해주십니다."
                ],
                "rating": 4.73
            }
        }
    };
      initKeywordScreenEvents(jsonData);
      sendResponse({ success: true });
  }
});

function initKeywordScreenEvents(jsonData) {
  const organizeBtn = document.getElementById("organize-btn");
  console.log(`➡️ 🚀${jsonData} 이동 중...🚀`);
  renderKeywordCategories(jsonData);
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