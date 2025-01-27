import pandas as pd
import re
import sys
import os
import re
from konlpy.tag import Kkma #형태소 분석기
from konlpy.tag import Okt
from soynlp.word import WordExtractor
from soynlp.tokenizer import LTokenizer
from soynlp.tokenizer import MaxScoreTokenizer
from krwordrank.sentence import summarize_with_sentences
import random

stopwords_lst = ['등록된', '리뷰', '조금', '수', '것', '없습니다', '도움이', '정말', '살짝', '또', '너무', '잘', '같아요', '엄청',  '바로', '한', '계속', '구매', '넣고', '먹기', '있어서', '다', '넘', '저는', '그냥', '맛이', '좋아요', 
                '아주', '펜슬', '좀', '좋고', '진짜', '완전', '있는', '때', '프로타주', '이', '좋아하는', '더', '좋은', '있습니다', '입니다', 
                '같아요', '있어', '좋은', '같습니다', '좋네요', '입니다', '있어요', '괜찮', '아니', '그런',
                '같아', '좋습니다', '좋을', '있는데', '없어', '아니라', '좋은', '같은', '없는', '어요', '좋아', '좋앗', '입니', '있고', '없고',
                '좋았', '좋습니', '생각',  '있을', '있습니', '있었', '아닌', '같습니', '습니', '니다', '정도']
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

def df_sumWordSentence(df, review_col, rate_col=None, stopwords=None, top_k=5, num_keywords=5, num_keysents=2, full_merge=False, rate_merge=False):
    if num_keywords < top_k:
        num_keywords = top_k
        
    def extract_keywords(texts, stopwords=None):
        try:
            keywords, _ = summarize_with_sentences(
                texts,
                stopwords=stopwords,
                num_keywords=num_keywords,
                num_keysents=num_keysents
            )
            top_keywords = sorted(keywords.items(), key=lambda x: x[1], reverse=True)[:top_k]
            return [word for word, _ in top_keywords]
        except ValueError:
            return None

    if full_merge:
        # 모든 리뷰를 하나로 합쳐 처리
        merged_reviews = '. '.join(df[review_col].dropna())
        texts = merged_reviews.split('. ')
        keywords = extract_keywords(texts, stopwords=stopwords)
        result_df = pd.DataFrame({'merge_type': ['full'], 'keywords': [keywords]})
        return result_df

    if rate_merge:
        # 평점별로 리뷰를 합쳐 처리
        if rate_col is None:
            raise ValueError("rate_merge=True 인 경우, rate_col을 지정해야 합니다.")
        
        rate_keywords = []
        for rate, group in df.groupby(rate_col):
            merged_reviews = '. '.join(group[review_col].dropna())
            texts = merged_reviews.split('. ')
            keywords = extract_keywords(texts, stopwords=stopwords)
            rate_keywords.append({'rate': rate, 'keywords': keywords})
        
        result_df = pd.DataFrame(rate_keywords)
        return result_df

    # 기본: 각 리뷰별 처리
    else:
        krwordrank_results = []
        for idx, row in df.iterrows():
            review_content = row[review_col]
            if pd.isna(review_content):
                krwordrank_results.append(None)
                continue
            
            # 문장 리스트
            texts = review_content.split('. ')
            keywords = extract_keywords(texts, stopwords=stopwords)
            krwordrank_results.append(keywords)

        # 새로운 열 추가
        df['krwordrank'] = krwordrank_results
        return df


def calculate_keyword_average_ratings(dataframe, keywords, review_column, rating_column):
    keyword_scores = {}
    for keyword in keywords:
        # Filter reviews that contain the keyword
        keyword_reviews = dataframe[dataframe[review_column].str.contains(keyword, na=False)]
        # Calculate the average rating
        avg_score = keyword_reviews[rating_column].mean()
        keyword_scores[keyword] = avg_score

    # Convert the results to a DataFrame
    result_df = pd.DataFrame(list(keyword_scores.items()), columns=['Keyword', 'Average Rating'])
    return result_df

# 마침표가 없어서 문장split이 안되길래 문장 별로 끊을 수 있도록 함수 추가함
def split_sentences(text):
    return re.split(r'(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?|\!)\s', text)

def get_sentences_with_keyword(review, keywords):
    sentences = split_sentences(review)
    return [sentence for sentence in sentences if any(keyword in sentence for keyword in keywords)]

def contains_numbers(text):
    return bool(re.search(r'\d+', text))

def filter_sentences(df, keywords, min_length=30, max_length=60, num_samples=3):
    df["filtered_sentences"] = df["리뷰 내용"].apply(lambda x: get_sentences_with_keyword(str(x), keywords))

    all_sentences = [
        sentence
        for sentences in df["filtered_sentences"].dropna()
        for sentence in sentences
        if not contains_numbers(sentence) 
    ]

    # 문장 길이가 30자 이상 50자 이하인 문장만 필터링함
    filtered_sentences = [
        sentence for sentence in all_sentences if min_length <= len(sentence) <= max_length
    ]

    if len(filtered_sentences) >= num_samples:
        return random.sample(filtered_sentences, num_samples)  # 그냥 랜덤으로 문장 선택
    else:
        return filtered_sentences 

import csv

def save_dict_to_csv(dictionary, file_path):
    """
    Save a dictionary to a CSV file.

    Args:
        dictionary (dict): The dictionary to save. Keys are written as column 1, values as column 2.
        file_path (str): The file path for the CSV file.
    """
    with open(file_path, mode='w', newline='', encoding='utf-8-sig') as csv_file:
        writer = csv.writer(csv_file)
        writer.writerow(['Key', 'Value'])  # Write header
        for key, value in dictionary.items():
            if isinstance(value, list):
                writer.writerow([key, ', '.join(value)])  # Join list values as a comma-separated string
            else:
                writer.writerow([key, value])

def main(file_path):
    df = pd.read_excel('가죽마우스패드 + 예쁜 노트북 가방 파우치 엘지그램 삼성 갤럭시북.xlsx')
    df = df[df["리뷰 내용"] != "등록된 리뷰내용이 없습니다"]

    # Train WordExtractor
    word_extractor = WordExtractor()
    word_extractor.train(df['리뷰 내용'].tolist())
    word_scores = word_extractor.extract()

    scores = {word: score.cohesion_forward for word, score in word_scores.items()}

    global ltokenizer
    ltokenizer = LTokenizer(scores=scores)

    df['preprocessed_review'] = preprocessing(
        df, 
        review_column='리뷰 내용', 
        pos_tags=['Noun', 'Pronoun', 'Adjective'],
        istokenize=True
    )

    full_merge_df = df_sumWordSentence(
        df, 
        review_col='preprocessed_review', 
        stopwords=stopwords_lst, 
        top_k=10, 
        full_merge=True
    )

    full_merge_keywords = sum(full_merge_df['keywords'].tolist(), [])

    result_df = calculate_keyword_average_ratings(df, full_merge_keywords, '리뷰 내용', '평점')

    full_merge_result = {}
    for i in range(len(result_df)):
        result = filter_sentences(df, result_df['Keyword'][i], min_length=30, max_length=60, num_samples=3)
        full_merge_result[result_df['Keyword'][i]] = result

    output_file = "full_merge_result.csv"
    save_dict_to_csv(full_merge_result, output_file)

    print(f"Dictionary saved to {output_file}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python keyword_analysis.py <file path>")
        sys.exit(1)
    main(sys.argv[1])