(() => {
    // popup이 클릭마다 executeScript로 재주입하므로 리스너는 한 번만 등록
    if (window.__coreviewLoaded) return;
    window.__coreviewLoaded = true;

    const SERVER = "http://localhost:8000";
    let recipe = null; // 사이트별 셀렉터 레시피 (chrome.storage.local, hostname 키)

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

        recipe = await ensureRecipe();
        if (!recipe) {
            console.error("❌ 리뷰 셀렉터를 찾지 못했습니다.");
            chrome.runtime.sendMessage({ action: "showErrorPage" });
            return;
        }

        if (mode === "fast") {
            console.log("🔹 상위 50개 리뷰 수집 시작...");
            await collectTopReviews(50, allReviews);
            console.log(`✅ 상위 50개 리뷰 수집 완료! (현재 ${allReviews.length}개)`);

            // console.log("🔹 1점 리뷰 수집 시작...");
            // await collectLowRatingReviews(1, lowRatingReviews['1'], 20);
            // console.log(`✅ 1점 리뷰 수집 완료! (총 ${lowRatingReviews['1'].length}개)`);

            // console.log("🔹 2점 리뷰 수집 시작...");
            // await collectLowRatingReviews(2, lowRatingReviews['2'], 20);
            // console.log(`✅ 2점 리뷰 수집 완료! (총 ${lowRatingReviews['2'].length}개)`);
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
        chrome.runtime.sendMessage({ action: "crawlComplete", data: finalReviews});
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
    
        console.log(`📄 ${targetRating}점 리뷰 페이지 ${currentPage} 크롤링 중...`);
    
        // 1. 리뷰 섹션으로 스크롤
        const reviewSection = document.querySelector(".sdp-review__article__list");
        if (reviewSection) {
            reviewSection.scrollIntoView({ behavior: "smooth" });
            console.log("🔄 리뷰 섹션으로 스크롤 완료");
            await new Promise(resolve => setTimeout(resolve, 500));  // 스크롤 후 대기
        }
    
        // 2. 별점 필터 선택
        const allStarsButton = document.querySelector(".sdp-review__article__order__star__all__current--active");
        if (allStarsButton) {
            allStarsButton.click();
            console.log("🔄 별점 선택 리스트를 펼쳤습니다.");
            await new Promise(resolve => setTimeout(resolve, 500));  // 대기
        }
    
        // 3. 별점 필터 버튼 찾기
        const filterButton = document.querySelector(`.sdp-review__article__order__star__list__item[data-rating="${targetRating}"]`);
        if (!filterButton) {
            console.error(`❌ ${targetRating}점 필터 버튼을 찾을 수 없음`);
            return;
        }
    
        console.log(`✅ ${targetRating}점 필터 버튼 찾음:`, filterButton);
    
        // 4. 강제 클릭 수행
        filterButton.scrollIntoView({ behavior: "smooth", block: "center" });
        await new Promise(resolve => setTimeout(resolve, 500));  // 대기
        forceClick(filterButton);
        console.log(`✅ ${targetRating}점 필터 버튼 클릭 완료`);
    
        // 5. 페이지 변경 대기
        await waitForPageChange(document.body.innerHTML, 10);
    
        // 6. 리뷰 수집 루프
        while (storage.length < maxCount) {
            const reviews = extractReviews();
            console.log(`📝 ${targetRating}점 리뷰 ${reviews.length}개 수집`);
            reviews.forEach(review => {
                if (parseInt(review.rating) === targetRating && storage.length < maxCount) {
                    storage.push(review);
                }
            });
    
            console.log(`🔹 현재 ${targetRating}점 리뷰 수집 개수: ${storage.length}/${maxCount}`);
    
            // 7. 다음 페이지 이동
            const nextPageButton = findNextPageButton(currentPage);
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
    

    function forceClick(element) {
        const rect = element.getBoundingClientRect();
        const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
        });
        element.dispatchEvent(clickEvent);
        console.log("✅ 강제 클릭 이벤트 발생:", element);
    }
    
    // ---- 레시피: { container, userName, reviewDate, rating, reviewContent: {sel, attr}, nextPage } ----

    function pick(root, field) {
        if (!field || !field.sel) return "";
        const el = root.querySelector(field.sel);
        if (!el) return "";
        return (field.attr ? el.getAttribute(field.attr) : el.textContent)?.trim() || "";
    }

    function extractReviews() {
        const reviews = [];
        document.querySelectorAll(recipe.container).forEach(reviewElement => {
            reviews.push({
                userName: pick(reviewElement, recipe.userName) || "-",
                reviewDate: pick(reviewElement, recipe.reviewDate) || "-",
                rating: (pick(reviewElement, recipe.rating).match(/\d+(\.\d+)?/) || ["0"])[0], // "5", "5점", "별점 5" 모두 처리
                reviewContent: pick(reviewElement, recipe.reviewContent) || "등록된 리뷰 내용이 없습니다"
            });
        });
        return reviews;
    }

    function findNextPageButton(currentPage) {
        const btn = recipe.nextPage && document.querySelector(recipe.nextPage);
        if (!btn || btn.disabled || btn.classList.contains("disabled") || btn.getAttribute("aria-disabled") === "true") return null;
        return btn;
    }

    const recipeKey = () => `recipe:${location.hostname}`;

    function loadRecipe() {
        return new Promise(resolve => chrome.storage.local.get(recipeKey(), r => resolve(r[recipeKey()] || null)));
    }

    function saveRecipe(r) {
        chrome.storage.local.set({ [recipeKey()]: { ...r, updatedAt: Date.now() } });
    }

    function recipeWorks(r) {
        if (!r || !r.container) return false;
        const first = document.querySelector(r.container);
        return !!first && pick(first, r.reviewContent).length > 0;
    }

    // 캐시된 레시피가 현재 DOM에서 동작하면 그대로, 아니면 LLM에 새로 요청
    async function ensureRecipe() {
        const cached = await loadRecipe();
        if (recipeWorks(cached)) return cached;
        console.log("🔎 캐시 레시피 없음/실패 → 셀렉터 재발견 요청");
        window.scrollTo(0, document.body.scrollHeight); // 지연 로딩 리뷰 영역 깨우기
        await new Promise(r => setTimeout(r, 1500));
        if (recipeWorks(cached)) return cached;
        const fresh = await discoverRecipe();
        if (!recipeWorks(fresh)) return null;
        saveRecipe(fresh);
        return fresh;
    }

    async function discoverRecipe() {
        try {
            const response = await fetch(`${SERVER}/discover`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: location.href, html: domSample() })
            });
            if (!response.ok) throw new Error(`서버 오류: ${response.status}`);
            const r = await response.json();
            console.log("🧭 LLM 레시피:", r);
            return r;
        } catch (error) {
            console.error("❌ 레시피 발견 실패:", error);
            return null;
        }
    }

    // LLM에 보낼 DOM 샘플: 구조만 남기고 30KB로 자름
    function domSample() {
        // ponytail: class/id에 review가 들어간 가장 큰 영역을 고르는 휴리스틱. 못 찾으면 body 전체.
        const candidates = [...document.querySelectorAll('[class*="review" i], [id*="review" i]')];
        const root = candidates.sort((a, b) => b.querySelectorAll("*").length - a.querySelectorAll("*").length)[0] || document.body;
        const clone = root.cloneNode(true);
        clone.querySelectorAll("script, style, svg, noscript, iframe, link, meta, img, video").forEach(e => e.remove());
        clone.querySelectorAll("*").forEach(el => {
            [...el.attributes].forEach(a => {
                if (!/^(class|id|data-|aria-label|aria-disabled|disabled)/.test(a.name)) el.removeAttribute(a.name);
            });
        });
        const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
        for (let n; (n = walker.nextNode());) n.nodeValue = n.nodeValue.trim().slice(0, 40);
        return clone.outerHTML.replace(/\s+/g, " ").slice(0, 30000);
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

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "retrySendData") {
            console.log("🔄 재전송 요청 수신: ", request.data);
            sendFailedDataToFlask(request.data);
        }
    });
    
    async function sendFailedDataToFlask(reviews) {
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
            console.log("✅ 재전송 성공: ", data);
    
            // 성공 메시지 popup.js로 전달
            chrome.runtime.sendMessage({ action: "showAnalysis", data: data }); // background 경유로 결과 저장
    
        } catch (error) {
            console.error("❌ 재전송 실패:", error);
            chrome.runtime.sendMessage({ action: "showErrorPage" });
        }
    }
    

})();
