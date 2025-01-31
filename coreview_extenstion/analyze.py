import sys  
import os
import pandas as pd
import re
import json
import random
from konlpy.tag import Okt
from soynlp.word import WordExtractor
from soynlp.tokenizer import LTokenizer
from krwordrank.sentence import summarize_with_sentences
from krwordrank.word import KRWordRank
from flask import Flask, request, jsonify
from flask_cors import CORS  # CORS 추가

app = Flask(__name__)
CORS(app)  # 전체 도메인에서 요청 허용

stopwords_lst = ['등록된', '리뷰', '조금', '수', '것', '없습니다', '도움이', '정말', '살짝', '또', '너무', '잘', '같아요', '엄청',  '바로', '한', '계속', '구매', '넣고', '먹기', '있어서', '다', '넘', '저는', '그냥', '맛이', '좋아요', 
                '아주', '펜슬', '좀', '좋고', '진짜', '완전', '있는', '때', '프로타주', '이', '좋아하는', '더', '좋은', '있습니다', '입니다', 
                '같아요', '있어', '좋은', '같습니다', '좋네요', '입니다', '있어요', '괜찮', '아니', '그런',
                '같아', '좋습니다', '좋을', '있는데', '없어', '아니라', '좋은', '같은', '없는', '어요', '좋아', '좋앗', '입니', '있고', '없고',
                '좋았', '좋습니', '생각',  '있을', '있습니', '있었', '아닌', '같습니', '습니', '니다', '정도', '쿠팡', '쿠팡체험단', '체험단', '스럽', '체험', '작성', '리뷰', '작성', '이벤트']
okt = Okt()

def preprocessing(df, review_column, istokenize=True, pos_tags=None, filter=None):
    #spaceing 객체 정의 및 초기화
    # spacing = Spacing()
    processed_reviews  = []
    #인풋리뷰
    for idx, r in enumerate(df[review_column]):
        #하나의 리뷰에서 문장 단위로 자르기
        #불필요한 정보제거 name의 각 단어를 review에서 제거 
        # 이름이 주어졌을 경우에만 이름 정보 제거
        sentence = r

        # #spacing 적용 
        # sentence = sentence.replace(" ", '')
        
        # sentence = spacing(sentence) 

        #특수문자, 영어 알파벳, 초성/중성/종성(예: "ㄱ", "ㅏ" 등)을 제거.
        sentence = re.sub('\n','',sentence)
        sentence = re.sub('\u200b','',sentence)
        sentence = re.sub('\xa0','',sentence)
        sentence = re.sub('([a-zA-Z])','',sentence)
        sentence = re.sub('[ㄱ-ㅎㅏ-ㅣ]+','',sentence)
        sentence = re.sub('[-=+,#/\?:^$.@*\"※~&%ㆍ!』\\‘|\(\)\[\]\<\>`\'…》]','',sentence)
        sentence = re.sub(r'\s+', ' ', sentence)  # 다중 공백 -> 단일 공백
        sentence = re.sub(r'[^\w\s]', '', sentence)  # 특수문자 제거
        sentence = re.sub(r'\d+', '', sentence)  # 숫자 제거
        #전처리 후 문장이 비어있으면 다음 리뷰로 넘어감 
        if len(sentence) == 0:
            continue
        
        # 토큰화 여부 확인
        if istokenize:
            tokens = ltokenizer.tokenize(sentence)  # LTokenizer를 이용한 토큰화
        else:
            tokens = [sentence]  # 토큰화하지 않고 원문 사용
        
        # 불용어 필터링
        if filter:
            tokens = [token for token in tokens if token not in filter]
        # 품사 필터링
        if pos_tags:
            filtered_tokens = []
            for token in tokens:
                pos = okt.pos(token, norm=True, stem=False)  # 품사 태깅
                filtered_tokens += [word for word, tag in pos if tag in pos_tags]

        else:
            filtered_tokens = []
            for token in tokens:
                pos = okt.pos(token, norm=True, stem=False)  # 품사 태깅
                filtered_tokens += [word for word, tag in pos]


        # 길이가 1인 단어 제거
        filtered_tokens = [token for token in filtered_tokens if len(token) > 1]

        # 토큰을 공백으로 연결하고 마침표 추가
        processed_sentence = ' '.join(filtered_tokens)
        processed_reviews.append(processed_sentence)
        
    return pd.Series(processed_reviews)  # 시리즈 형태로 반환

okt = Okt()
def filter_keywords_by_pos(df, column, pos_tags):
    """
    데이터프레임의 지정 열에서 리스트로 저장된 키워드들에 대해 특정 품사만 남기고, 단어 길이가 1 이하인 단어 제거.

    Args:
        df (pd.DataFrame): 입력 데이터프레임
        column (str): 키워드가 저장된 열 이름
        pos_tags (list[str]): 남길 품사 태그 리스트 (예: ['Noun', 'Adjective'])

    Returns:
        pd.DataFrame: 품사 필터링이 적용된 결과
    """
    filtered_results = []
    df = df.copy()

    for keyword_list in df[column]:
        if not isinstance(keyword_list, list):
            filtered_results.append([])
            continue

        filtered_keywords = []
        for keyword in keyword_list:
            # 품사 태깅
            pos = okt.pos(keyword)
            # 지정한 품사만 필터링
            filtered_keywords += [word for word, tag in pos if tag in pos_tags]

        # 단어 길이가 1인 단어 제거
        filtered_keywords = [word for word in filtered_keywords if len(word) > 1]

        # 결과 저장
        filtered_results.append(filtered_keywords)

    # 데이터프레임에 새로운 열 추가
    df[f'{column}_filtered'] = filtered_results
    return df

def df_krwordRank(df, review_col, rate_col=None, stopwords=None, top_k=5, num_keywords=10, min_count=1, max_length=50, full_merge=False, rate_merge=False):
    """
    데이터프레임에서 특정 열을 전처리하고 키워드 추출 결과를 데이터프레임에 저장.

    Parameters:
    - df: pd.DataFrame - 입력 데이터프레임
    - review_col: str - 리뷰 내용을 포함하는 열 이름
    - rate_col: str - 평점 열의 이름 (rate_merge=True인 경우 필요)
    - stopwords: list[str] 불용어 리스트
    - top_k: int - 각 리뷰별 상위 키워드 개수
    - num_keywords: int - 추출할 키워드 개수
    - min_count: int - 단어 최소 등장 빈도
    - max_length: int - 단어 최대 길이
    - full_merge: bool - True일 경우 모든 리뷰를 합쳐서 처리
    - rate_merge: bool - True일 경우 평점별로 리뷰를 합쳐서 처리

    Returns:
    - result_df: pd.DataFrame - 키워드 열이 추가된 데이터프레임
    """
    if num_keywords < top_k:
        num_keywords = top_k

    def extract_keywords(texts, row=None):
        if not texts or len(' '.join(texts).strip()) == 0:  # 텍스트가 비어있거나 공백만 포함된 경우
            print("입력 텍스트가 유효하지 않습니다.")
            return None
        
        # KRWordRank 모델 초기화
        krwordrank = KRWordRank(
            min_count=min_count,
            max_length=max_length,
            verbose=True
        )
        
        try:
            result = krwordrank.extract(
                texts, 
                beta=0.85, 
                max_iter=50, 
                num_keywords=num_keywords
            )
            keywords = result[0]

            if keywords is None:
                print("키워드 추출 실패: 결과가 None입니다.")
                return None
            
            top_keywords = sorted(keywords.items(), key=lambda x: x[1], reverse=True)[:top_k]
            return [word for word, _ in top_keywords]
        
        except Exception as e:
            print(str(row) + " error occurs:")
            print(e)
            return None

    if full_merge:
        # 모든 리뷰를 하나로 합쳐 처리
        merged_reviews = '. '.join(df[review_col].dropna())
        
        # 불용어 제거
        if stopwords:
            for word in stopwords:
                merged_reviews = merged_reviews.replace(word, '')
        
        texts = merged_reviews.split('. ')
        keywords = extract_keywords(texts)
        result_df = pd.DataFrame({'merge_type': ['full'], 'keywords': [keywords]})
        return result_df

    if rate_merge:
        # 평점별로 리뷰를 합쳐 처리
        if rate_col is None:
            raise ValueError("rate_merge=True 인 경우, rate_col을 지정해야 합니다.")
        
        rate_keywords = []
        for rate, group in df.groupby(rate_col):
            merged_reviews = '. '.join(group[review_col].dropna())
            
            # 불용어 제거
            if stopwords:
                for word in stopwords:
                    merged_reviews = merged_reviews.replace(word, '')
            
            texts = merged_reviews.split('. ')
            keywords = extract_keywords(texts)
            rate_keywords.append({'rate': rate, 'keywords': keywords})
        
        result_df = pd.DataFrame(rate_keywords)
        return result_df
    
    else:
        # 기본: 각 리뷰별 처리
        krwordrank_results = []
        for idx, row in df.iterrows():
            review_content = row[review_col]

            if pd.isna(review_content):
                krwordrank_results.append(None)
                continue
            
            # 불용어 제거
            if stopwords:
                for word in stopwords:
                    review_content = review_content.replace(word, '')
            
            # 문장 리스트
            texts = review_content.split('. ')
            keywords = extract_keywords(texts, row=idx)
            krwordrank_results.append(keywords)

        # 새로운 열 추가
        df['krwordrank'] = krwordrank_results
        return df
    

def calculate_keyword_average_ratings(df, keyword_lists, review_column, rating_column):
    keyword_scores = {}
    
    for keyword_list in keyword_lists:
        if isinstance(keyword_list, list):  # 리스트인지 확인
            for keyword in keyword_list:
                if isinstance(keyword, str) and len(keyword) > 0:  # 빈 문자열 방지
                    mask = df[review_column].str.contains(keyword, na=False)
                    avg_score = df.loc[mask, rating_column].astype(float).mean()
                    keyword_scores[keyword] = avg_score

    return keyword_scores


def filter_sentences(df, keywords, min_length=1, max_length=50000, num_samples=3):
    def get_sentences_with_keyword(review, keywords):
        sentences = re.split(r'(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?|\!|\-)\s', review)
        return [sentence for sentence in sentences if any(keyword in sentence for keyword in keywords)]
    
    df["filtered_sentences"] = df["reviewContent"].apply(lambda x: get_sentences_with_keyword(str(x), keywords))
    filtered_sentences = [sentence for sentences in df["filtered_sentences"].dropna() for sentence in sentences if min_length <= len(sentence) <= max_length]

    return random.sample(filtered_sentences, min(num_samples, len(filtered_sentences))) if filtered_sentences else []

def save_dict_to_json(dictionary, file_path):
    with open(file_path, 'w', encoding='utf-8-sig') as json_file:
        json.dump(dictionary, json_file, ensure_ascii=False, indent=4)

def calculate_keyword_statistics(df, keyword_lists, review_column, rating_column):
    keyword_stats = {}

    for keyword_list in keyword_lists:
        if isinstance(keyword_list, list):  # 리스트인지 확인
            for keyword in keyword_list:
                if isinstance(keyword, str) and len(keyword) > 0:  # 빈 문자열 방지
                    mask = df[review_column].str.contains(keyword, na=False)
                    matched_reviews = df.loc[mask, rating_column].astype(float)

                    avg_score = matched_reviews.mean()
                    count = matched_reviews.count()

                    keyword_stats[keyword] = {
                        "rating": round(avg_score, 2) if not pd.isna(avg_score) else None,
                        "count": int(count)
                    }

    return keyword_stats


@app.route('/analyze', methods=['POST'])
def analyze_reviews():
    """크롬 익스텐션에서 받은 리뷰 데이터를 분석하는 API"""
    data = request.json
    reviews = data.get("reviews", [])

    if not reviews:
        return jsonify({"error": "리뷰 데이터가 없습니다."}), 400

    df = pd.DataFrame(reviews)

    # 불필요한 리뷰 제거 및 정제
    df = df[df["reviewContent"] != "등록된 리뷰 내용이 없습니다"]
    df["reviewContent"] = df["reviewContent"].str.replace("쿠팡체험단 이벤트로 상품을 무료 제공받아 작성한 리뷰입니다.", "", regex=False)
    df["reviewContent"] = df["reviewContent"].str.replace(r'[-=_ㅡ—ㅋ]{3,}', "", regex=True)
    df["reviewContent"] = df["reviewContent"].str.replace("\n", "", regex=False)

    # soynlp의 WordExtractor를 사용하여 단어 점수 계산
    word_extractor = WordExtractor()
    word_extractor.train(df['reviewContent'].tolist())
    scores = {word: score.cohesion_forward for word, score in word_extractor.extract().items()}

    global ltokenizer
    ltokenizer = LTokenizer(scores=scores)

    # 리뷰 텍스트 전처리 수행
    df['preprocessed_review'] = df["reviewContent"].apply(lambda x: ' '.join([word for word in okt.nouns(x) if word not in stopwords_lst]))

    # KRWordRank를 사용하여 키워드 추출
    full_merge_df = df_krwordRank(df, review_col='preprocessed_review', stopwords=stopwords_lst, top_k=150, full_merge=True)

    ### 🔹 명사(Noun) 키워드 추출 ###
    pos_tags_noun = ['Noun', 'Pronoun']
    df_noun = filter_keywords_by_pos(full_merge_df, column='keywords', pos_tags=pos_tags_noun)
    
    print("\n=== Noun Keywords ===")
    print(df_noun['keywords_filtered'].head(10))  # 올바르게 필터링되었는지 확인
    
    # 명사 키워드별 통계 계산
    keyword_stats_noun = calculate_keyword_statistics(df, df_noun['keywords_filtered'].tolist(), 'reviewContent', 'rating')

    # 🔹 **상위 10개 명사 키워드 선택 + 예제 문장 포함**
    noun_result = {
        keyword: {
            "rating": keyword_stats_noun[keyword]["rating"],
            "count": keyword_stats_noun[keyword]["count"],
            "examples": filter_sentences(df, [keyword], min_length=1, max_length=8000, num_samples=3)
        }
        for keyword in list(keyword_stats_noun.keys())[:10]  # 상위 10개만 선택
    }

    ### 🔹 형용사(Adjective) 키워드 추출 ###
    pos_tags_adj = ['Adjective']
    df_adj = filter_keywords_by_pos(full_merge_df, column='keywords', pos_tags=pos_tags_adj)
    
    print("\n=== Adjective Keywords ===")
    print(df_adj['keywords_filtered'].head(10))  # 올바르게 필터링되었는지 확인

    # 형용사 키워드별 통계 계산
    keyword_stats_adj = calculate_keyword_statistics(df, df_adj['keywords_filtered'].tolist(), 'reviewContent', 'rating')

    # 🔹 **상위 10개 형용사 키워드 선택 + 예제 문장 포함**
    adj_result = {
        keyword: {
            "rating": keyword_stats_adj[keyword]["rating"],
            "count": keyword_stats_adj[keyword]["count"],
            "examples": filter_sentences(df, [keyword], min_length=1, max_length=8000, num_samples=3)
        }
        for keyword in list(keyword_stats_adj.keys())[:10]  # 상위 10개만 선택
    }

    return jsonify({"nouns": noun_result, "adjectives": adj_result})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)