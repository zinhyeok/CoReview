(() => {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "startCrawling") {
            startCrawling();
        }
    });

    async function startCrawling() {
        console.log("🚀 리뷰 크롤링을 시작합니다...");
        
        let allReviews = [];
        let currentPage = 1;
        let visitedPages = new Set();

        while (true) {
            console.log(`📄 페이지 ${currentPage} 리뷰 크롤링 중...`);

            // 현재 페이지 리뷰 가져오기
            const reviews = extractReviews();
            allReviews = allReviews.concat(reviews);
            visitedPages.add(currentPage);

            // 마지막 페이지인지 확인
            let nextPageButton = findNextPageButton(currentPage, visitedPages);
            if (!nextPageButton) {
                console.log("🚀 더 이상 페이지 없음 → 크롤링 종료!");
                break;
            }

            // 현재 페이지 내용 저장 (DOM 변경 감지용)
            let previousPageContent = document.body.innerHTML;

            // 다음 페이지 클릭
            nextPageButton.click();
            console.log(`➡️ 페이지 ${currentPage + 1} 이동 중...`);

            // 페이지가 변경될 때까지 대기 (최대 10초)
            let pageChanged = await waitForPageChange(previousPageContent, 10);
            if (!pageChanged) {
                console.warn("⚠️ 페이지 로딩 실패! → 크롤링 종료");
                break;
            }

            currentPage++;
        }

        console.log(`✅ 총 ${allReviews.length}개의 리뷰를 수집했습니다.`);
        // saveJSON(allReviews);
        sendToFlask(allReviews)
    }

    function extractReviews() {
        const reviews = [];
        const reviewElements = document.querySelectorAll("article.sdp-review__article__list");

        reviewElements.forEach((reviewElement) => {
            const userName = reviewElement.querySelector("span.sdp-review__article__list__info__user__name")?.textContent.trim() || "-";
            const reviewDate = reviewElement.querySelector("div.sdp-review__article__list__info__product-info__reg-date")?.textContent.trim() || "-";
            const rating = reviewElement.querySelector("div.sdp-review__article__list__info__product-info__star-orange")?.getAttribute("data-rating") || "0";
            const reviewContent = reviewElement.querySelector("div.sdp-review__article__list__review > div")?.textContent.trim() || "등록된 리뷰 내용이 없습니다";

            reviews.push({
                userName,
                reviewDate,
                rating,
                reviewContent,
            });
        });

        return reviews;
    }

    function findNextPageButton(currentPage, visitedPages) {
        // 현재 페이지 번호보다 1 큰 페이지 버튼 찾기
        let nextPageButton = document.querySelector(`button.sdp-review__article__page__num.js_reviewArticlePageBtn[data-page="${currentPage + 1}"]`);

        // 다음 페이지 버튼이 없으면 "다음" 버튼 찾기
        if (!nextPageButton) {
            const nextArrowButton = document.querySelector(".sdp-review__article__page__next");
            if (nextArrowButton && !nextArrowButton.classList.contains("disabled")) {
                return nextArrowButton;
            }
        }

        return nextPageButton;
    }

    async function waitForPageChange(previousPageContent, maxRetries) {
        console.log("⌛ 페이지 변경 감지 중...");
        
        let attempts = maxRetries;
        while (attempts > 0) {
            await new Promise((resolve) => setTimeout(resolve, 1500)); // 1.5초 대기
            
            // DOM이 변경되었는지 확인
            if (document.body.innerHTML !== previousPageContent) {
                console.log("✅ 페이지 로딩 완료!");
                return true;
            }
            
            attempts--;
        }

        return false;  // 변경 감지 실패
    }

    function saveJSON(data) {
        const jsonData = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonData], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "coupang_reviews.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        console.log("📁 JSON 파일 다운로드 완료!");
    }

    //플라스크로 크롤링한 데이터 이동 content.js -->background.js가 중계역할 --> analyze.py 분석 결과 --> popup.js
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
            console.log("🔍 분석 결과:", data);
    
            // 분석 결과를 popup.js로 전송
            chrome.runtime.sendMessage({ action: "showAnalysis", data: data });
    
        } catch (error) {
            console.error("❌ Flask 서버 요청 실패:", error);
        }
    }    

})();