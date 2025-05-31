import sys
import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import time
import traceback
import webbrowser
import threading

try:
    from ai import ReviewAnalyzer
    from wb import WbReview
except ImportError as e:
    print(f"Критическая ошибка импорта: {e}")
    # Если модули не найдены, продолжаем работу, но API будет неработоспособен
    ReviewAnalyzer = None
    WbReview = None

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# Функция для извлечения ID товара из URL или прямого ввода
def extract_product_id_py(url_or_id):
    if isinstance(url_or_id, str) and url_or_id.isdigit():
        return url_or_id
    
    # Извлечение ID из URL Wildberries
    if isinstance(url_or_id, str):
        import re
        match = re.search(r"wildberries\.ru/catalog/(\d+)", url_or_id)
        if match and match.group(1):
            return match.group(1)
        
        # Поиск числового ID в URL
        num_match = re.search(r"\d{7,15}", url_or_id)
        if num_match:
            return num_match.group(0)
        
        return url_or_id[:20] + "..." # Сокращаем длинные строки
    return "unknown_id"


@app.route('/api/analyze', methods=['POST'])
def analyze_reviews_api():
    if not WbReview or not ReviewAnalyzer:
        return jsonify({"error": "Ошибка сервера: не удалось загрузить модули анализа."}), 500

    data = request.get_json()
    mode = data.get('mode')

    try:
        if mode == 'single':
            product_url_input = data.get('product_url')
            if not product_url_input:
                return jsonify({"error": "URL товара или ID не указан"}), 400

            product_id = extract_product_id_py(product_url_input)
            
            # Получение данных о товаре
            wb_instance = WbReview(product_id)
            product_name = wb_instance.product_name or f"Товар {product_id}"
            reviews_list = wb_instance.parse(only_this_variation=True)

            if not reviews_list:
                analysis_result = f"В настоящее время для «{product_name}» (ID {product_id}) отзывов не найдено. Анализ невозможен."
            else:
                # Подготовка текстов отзывов для анализа
                reviews_texts = []
                for r in reviews_list:
                    text_parts = []
                    if r.get('text'): text_parts.append(r.get('text'))
                    if r.get('pros'): text_parts.append(f"Плюсы: {r.get('pros')}")
                    if r.get('cons'): text_parts.append(f"Минусы: {r.get('cons')}")
                    reviews_texts.append("\n".join(text_parts))
                
                analysis_result = ReviewAnalyzer.analyze_reviews(reviews_texts, product_name)
            
            response_data = {
                "product_name": product_name,
                "analysis": analysis_result,
                "type": "single"
            }
            return jsonify(response_data)

        elif mode == 'multi':
            product_url_inputs = data.get('product_urls', [])
            valid_product_inputs = [url for url in product_url_inputs if url and isinstance(url, str) and url.strip()]

            if len(valid_product_inputs) < 2:
                return jsonify({"error": "Для сравнения требуется как минимум два товара"}), 400

            individual_analyses_data = []

            for input_str in valid_product_inputs:
                product_id = extract_product_id_py(input_str)
                wb_instance = WbReview(product_id)
                product_name = wb_instance.product_name or f"Товар {product_id}"
                reviews_list = wb_instance.parse(only_this_variation=True)
                
                current_analysis_text = ""
                review_count = 0
                if not reviews_list:
                    current_analysis_text = f"Для «{product_name}» (ID {product_id}) отзывов не найдено."
                else:
                    review_count = len(reviews_list)
                    reviews_texts = []
                    for r in reviews_list:
                        text_parts = []
                        if r.get('text'): text_parts.append(r.get('text'))
                        if r.get('pros'): text_parts.append(f"Плюсы: {r.get('pros')}")
                        if r.get('cons'): text_parts.append(f"Минусы: {r.get('cons')}")
                        reviews_texts.append("\n".join(text_parts))
                    current_analysis_text = ReviewAnalyzer.analyze_reviews(reviews_texts, product_name)
                
                individual_analyses_data.append({
                    "product_id": product_id,
                    "product_name": product_name,
                    "analysis": current_analysis_text,
                    "review_count": review_count
                })
            
            # Формирование общего сравнения товаров
            comparison_prompt = ReviewAnalyzer._generate_comparison_prompt(individual_analyses_data)
            overall_recommendation_text = ""
            
            # Проверка возможности сравнения
            failed_analyses = "Анализ не удалось завершить" in " ".join(d["analysis"] for d in individual_analyses_data)
            not_enough_data_for_comparison = len(valid_product_inputs) < 2

            if not comparison_prompt: 
                overall_recommendation_text = "Недостаточно данных для формирования общих рекомендаций."
            elif failed_analyses or not_enough_data_for_comparison:
                overall_recommendation_text = "Не удалось выполнить полное сравнение из-за проблем с анализом одного или нескольких товаров, или недостаточного количества товаров для сравнения."
            else:
                overall_recommendation_text = ReviewAnalyzer._get_ai_response(comparison_prompt)

            product_names_for_title = [d["product_name"] for d in individual_analyses_data]
            overall_title = f"Сравнение: {', '.join(product_names_for_title)}"

            response_data = {
                "comparison_title": overall_title,
                "individual_product_analyses": individual_analyses_data,
                "overall_recommendation": overall_recommendation_text,
                "type": "multi"
            }
            return jsonify(response_data)

        else:
            return jsonify({"error": "Неверный режим анализа"}), 400
    
    except Exception as e:
        print(f"Ошибка в /api/analyze: {traceback.format_exc()}")
        return jsonify({"error": f"Внутренняя ошибка сервера: {str(e)}"}), 500

# Роут для главной страницы
@app.route('/')
def serve_index():
    return send_from_directory(os.getcwd(), 'index.html')

if __name__ == '__main__':
    # Запуск на порту 5001 для избежания конфликтов
    app.run(debug=True, port=5001)

    # Автоматическое открытие браузера
    def open_browser():
        time.sleep(1.5)  # Даем серверу время запуститься
        webbrowser.open('http://localhost:5001')
    
    threading.Thread(target=open_browser).start()