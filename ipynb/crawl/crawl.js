const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');

async function crawlReviewsByRating(productUrl, targetRating) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(productUrl);

  // 리뷰 섹션으로 스크롤
  await page.evaluate(() => {
    document.querySelector('.sdp-review__article__list').scrollIntoView();
  });

  // 원하는 별점 선택
  await page.click(`#btfTab > ul.sdp-review__article__order.js_reviewArticleOrder > li:nth-child(${targetRating + 1}) > button`);

  // 리뷰 데이터 추출
  const reviews = await page.evaluate(() => {
    const reviewElements = document.querySelectorAll('.sdp-review__article__list__review');
    return Array.from(reviewElements).map(review => ({
      rating: review.querySelector('.sdp-review__article__list__info__product-info__star-orange')?.getAttribute('data-rating'),
      content: review.querySelector('.sdp-review__article__list__review__content')?.textContent.trim()
    }));
  });

  await browser.close();
  return reviews;
}

// 사용 예시
const productUrl = 'https://www.coupang.com/vp/products/7492422188?vendorItemId=86701855176&sourceType=HOME_GW_PROMOTION&searchId=feed-ebe6716f34d346d2892329556504945e-gw_promotion&isAddedCart=';
const targetRating = 1;// 5점 리뷰 크롤링

crawlReviewsByRating(productUrl, targetRating)
  .then(reviews => console.log(reviews))
  .catch(error => console.error('Error:', error));
