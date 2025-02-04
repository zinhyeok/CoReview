(() => {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log("🔍 크롤링 요청 받음: ", request);
        if (request.action === "startCrawling") {
            startCrawling(request.limit, request.includeLowRatings, request.mode);
        }
    });

    async function startCrawling(limit = 10000, includeLowRatings = false, mode = "slow") {
        console.log("📌 startCrawling 호출됨!");
        console.log("✅ 전달된 모드:", mode);
        console.log(`🚀 ${mode === "fast" ? "빠른 모드" : "전체 크롤링"} 시작...`);

        let allReviews = [];
        let lowRatingReviews = { '1': [], '2': [] };
        let visitedPages = new Set();

        if (mode === "fast") {
            console.log("🔹 상위 50개 리뷰 수집 시작...");
            await collectTopReviews(50, allReviews);
            console.log(`✅ 상위 50개 리뷰 수집 완료! (현재 ${allReviews.length}개)`);

            console.log("🔹 1점 리뷰 수집 시작...");
            await collectLowRatingReviews(1, lowRatingReviews['1'], 20);
            console.log(`✅ 1점 리뷰 수집 완료! (총 ${lowRatingReviews['1'].length}개)`);

            console.log("🔹 2점 리뷰 수집 시작...");
            await collectLowRatingReviews(2, lowRatingReviews['2'], 20);
            console.log(`✅ 2점 리뷰 수집 완료! (총 ${lowRatingReviews['2'].length}개)`);
        } else {
            console.log("🔹 전체 리뷰 크롤링 시작...");
            let currentPage = 1;
            while (allReviews.length < limit) {
                console.log(`📄 페이지 ${currentPage} 리뷰 크롤링 중...`);
                const reviews = extractReviews();
                allReviews.push(...reviews);
                visitedPages.add(currentPage);

                if (allReviews.length >= limit) break;

                let nextPageButton = findNextPageButton(currentPage);
                
                if (!nextPageButton) {
                    console.log("🚀 더 이상 페이지 없음 → 크롤링 종료!");
                    break;
                }
                // 현재 페이지 내용 저장 (DOM 변경 감지용)
                let previousPageContent = document.body.innerHTML;
                nextPageButton.click();
                console.log(`➡️ 페이지 ${currentPage + 1} 이동 중...`);

                let pageChanged = await waitForPageChange(previousPageContent, 10);
                if (!pageChanged) {
                    console.log("⚠️ 페이지 로딩 실패! → 크롤링 종료");
                    break;
                }
                currentPage++;
            }
        }

        let finalReviews = [...allReviews, ...lowRatingReviews['1'], ...lowRatingReviews['2']];
        console.log(`✅ 총 ${finalReviews.length}개의 리뷰를 수집했습니다.`);
        // saveJSON(finalReviews);
        sendToFlask(finalReviews);
    }

    async function collectTopReviews(maxCount, storage) {
        let currentPage = 1;
        while (storage.length < maxCount) {
            const reviews = extractReviews();
            storage.push(...reviews.slice(0, maxCount - storage.length));

            let nextPageButton = findNextPageButton(currentPage);
            if (!nextPageButton || storage.length >= maxCount) break;

            let previousPageContent = document.body.innerHTML;
            nextPageButton.click();
            await waitForPageChange(previousPageContent, 10);
            currentPage++;
        }
    }

    async function collectLowRatingReviews(targetRating, storage, maxCount) {
        let currentPage = 1;
    
        while (storage.length < maxCount) {
            console.log(`📄 ${targetRating}점 리뷰 페이지 ${currentPage} 크롤링 중...`);
    
            // ⭐ 1점/2점 필터 버튼 찾기
            let filterButtons = document.querySelectorAll(".js_reviewArticleStarSelectOption");
            let filterButton = Array.from(filterButtons).find(el => el.getAttribute("data-rating") === targetRating.toString());
    
            if (filterButton) {
                console.log(`✅ ${targetRating}점 필터 버튼 클릭`);
                filterButton.click();
                await waitForPageChange(document.body.innerHTML, 10);
            } else {
                console.error(`❌ ${targetRating}점 필터 버튼을 찾을 수 없음`);
                break;
            }
    
            // ⭐ 리뷰 수집
            const reviews = extractReviews();
            console.log(`📝 ${targetRating}점 리뷰 ${reviews.length}개 수집`);
    
            reviews.forEach(review => {
                if (parseInt(review.rating) === targetRating && storage.length < maxCount) {
                    storage.push(review);
                }
            });
    
            console.log(`🔹 현재 ${targetRating}점 리뷰 수집 개수: ${storage.length}/${maxCount}`);
    
            // ✅ 다음 페이지 이동 (상위 50개 크롤링할 때 쓰는 코드와 동일하게 적용)
            let nextPageButton = findNextPageButton(currentPage);
            if (!nextPageButton || storage.length >= maxCount) {
                console.log(`✅ ${targetRating}점 리뷰 ${storage.length}개 수집 완료!`);
                break;
            }
    
            let previousPageContent = document.body.innerHTML;
            nextPageButton.click();
            console.log(`➡️ ${targetRating}점 페이지 ${currentPage + 1} 이동 중...`);
            await waitForPageChange(previousPageContent, 10);
            currentPage++;
        }
    }    

    function extractReviews() {
        const reviews = [];
        document.querySelectorAll("article.sdp-review__article__list").forEach(reviewElement => {
            reviews.push({
                userName: reviewElement.querySelector("span.sdp-review__article__list__info__user__name")?.textContent.trim() || "-",
                reviewDate: reviewElement.querySelector("div.sdp-review__article__list__info__product-info__reg-date")?.textContent.trim() || "-",
                rating: reviewElement.querySelector("div.sdp-review__article__list__info__product-info__star-orange")?.getAttribute("data-rating") || "0",
                reviewContent: reviewElement.querySelector("div.sdp-review__article__list__review > div")?.textContent.trim() || "등록된 리뷰 내용이 없습니다"
            });
        });
        return reviews;
    }
    

    function findNextPageButton(currentPage) {
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
            await new Promise(resolve => setTimeout(resolve, 1500));
            if (document.body.innerHTML !== previousPageContent) return true;
            attempts--;
        }
        return false;
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
            chrome.runtime.sendMessage({ action: "showAnalysis", data: data });

        } catch (error) {
            console.error("❌ Flask 서버 요청 실패:", error);
            chrome.runtime.sendMessage({ action: "saveFailedData", data: reviews });
            chrome.runtime.sendMessage({ action: "showErrorPage" });
        }
    }

})();
