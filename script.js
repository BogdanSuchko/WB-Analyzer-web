document.addEventListener("DOMContentLoaded", () => {
    const modeRadios = document.querySelectorAll('input[name="analysisMode"]');
    const singleProductInput = document.getElementById("singleProductInput");
    const multiProductInput = document.getElementById("multiProductInput");
    const analyzeButton = document.getElementById("analyzeButton");
    const historyButton = document.getElementById("historyButton");
    
    const mainScreen = document.querySelector(".input-section"); // Предполагаем, что это главный экран
    const resultsSection = document.getElementById("resultsSection");
    const historySection = document.getElementById("historySection");
    const loadingOverlay = document.getElementById("loadingOverlay");

    const backButton = document.getElementById("backButton");
    const backToMainFromHistoryButton = document.getElementById("backToMainFromHistoryButton");

    // Элементы результатов
    const productNameResult = document.getElementById("productNameResult");
    const analysisResultText = document.getElementById("analysisResultText");
    const singleResultContainer = document.getElementById("singleResultContainer");
    
    // Элементы сравнения
    const comparisonResultContainer = document.getElementById("comparisonResultContainer");
    const comparisonOverallTitle = document.getElementById("comparisonOverallTitle");
    const comparisonColumnsContainer = document.getElementById("comparisonColumnsContainer");
    const overallRecommendationText = document.getElementById("overallRecommendationText");

    // Элементы истории
    const historyList = document.getElementById("historyList");
    const noHistoryMessage = document.getElementById("noHistoryMessage");
    const clearHistoryButton = document.getElementById("clearHistoryButton");

    // Инпуты для сравнения товаров
    const productUrlInputs = [
        document.getElementById("productUrl1"),
        document.getElementById("productUrl2"),
        document.getElementById("productUrl3"),
        document.getElementById("productUrl4")
    ];

    let analysisHistory = []; // Массив для хранения истории
    const API_BASE_URL = ""; // Адрес нашего Flask-сервера теперь относительный

    // --- Инициализация --- 
    loadHistory();
    loadComparisonInputs(); // Загружаем сохраненные значения инпутов сравнения
    loadAnalysisMode();   // Загружаем и устанавливаем сохраненный режим анализа
    loadLastActiveScreen(); // Загружаем последний активный экран и результаты, если были
    updateHistoryView();
    // updateInputMode(); // Устанавливаем правильный режим при загрузке - теперь вызывается в loadAnalysisMode

    // --- Переключение режимов ввода ---
    modeRadios.forEach(radio => {
        radio.addEventListener("change", updateInputMode);
    });

    function updateInputMode() {
        const selectedMode = document.querySelector('input[name="analysisMode"]:checked').value;
        localStorage.setItem('wbAnalyzerMode', selectedMode); // Сохраняем режим
        singleProductInput.style.display = selectedMode === "single" ? "block" : "none";
        multiProductInput.style.display = selectedMode === "multi" ? "block" : "none";
    }

    // --- Сохранение/загрузка инпутов сравнения --- 
    function saveComparisonInput(index, value) {
        localStorage.setItem(`wbAnalyzerCompUrl${index + 1}`, value);
    }

    function loadComparisonInputs() {
        productUrlInputs.forEach((input, index) => {
            if (input) { // Убедимся, что элемент существует
                const savedValue = localStorage.getItem(`wbAnalyzerCompUrl${index + 1}`);
                if (savedValue) {
                    input.value = savedValue;
                }
                // Добавляем слушатель для сохранения при вводе
                input.addEventListener('input', () => {
                    saveComparisonInput(index, input.value);
                });
            }
        });
    }

    // --- Сохранение/загрузка режима анализа ---
    function loadAnalysisMode() {
        const savedMode = localStorage.getItem('wbAnalyzerMode');
        if (savedMode) {
            const radioToSelect = document.querySelector(`input[name="analysisMode"][value="${savedMode}"]`);
            if (radioToSelect) {
                radioToSelect.checked = true;
            }
        }
        updateInputMode(); // Обновляем UI в соответствии с загруженным или дефолтным режимом
    }

    // --- Показ/скрытие экранов ---
    function showScreen(screenToShow) {
        mainScreen.style.display = "none";
        resultsSection.style.display = "none";
        historySection.style.display = "none";
        loadingOverlay.style.display = "none";

        if (screenToShow === "main") mainScreen.style.display = "block";
        else if (screenToShow === "results") resultsSection.style.display = "block";
        else if (screenToShow === "history") historySection.style.display = "block";
        else if (screenToShow === "loading") loadingOverlay.style.display = "flex";
        
        localStorage.setItem('wbAnalyzerLastScreen', screenToShow); // Сохраняем активный экран
    }
    
    // --- Кнопки навигации ---
    backButton.addEventListener("click", () => {
        // Если мы смотрели результат из истории, вернуться к истории
        if (resultsSection.dataset.fromHistory === "true") {
            showScreen("history");
        } else {
            showScreen("main");
        }
        clearResultView();
    });

    backToMainFromHistoryButton.addEventListener("click", () => {
        showScreen("main");
    });
    
    historyButton.addEventListener("click", () => {
        updateHistoryView();
        showScreen("history");
    });

    // --- Анализ --- 
    analyzeButton.addEventListener("click", async () => {
        const mode = document.querySelector('input[name="analysisMode"]:checked').value;
        showScreen("loading");
        updateLoadingProgress(0, "Подключение к серверу...");

        let requestBody = { mode };
        let errors = [];

        if (mode === "single") {
            const productUrl = document.getElementById("singleProductUrl").value.trim();
            if (!productUrl) errors.push("Введите ссылку на товар или артикул.");
            requestBody.product_url = productUrl;
        } else {
            const productInputs = [
                document.getElementById("productUrl1").value.trim(),
                document.getElementById("productUrl2").value.trim(),
                document.getElementById("productUrl3").value.trim(),
                document.getElementById("productUrl4").value.trim()
            ];
            const validProductUrls = productInputs.filter(url => url !== "");
            if (validProductUrls.length < 2) errors.push("Введите минимум два товара для сравнения.");
            requestBody.product_urls = validProductUrls;
        }

        if (errors.length > 0) {
            alert(errors.join("\n"));
            showScreen("main");
            return;
        }
        
        updateLoadingProgress(0.1, "Отправка запроса на сервер...");

        try {
            const response = await fetch(`${API_BASE_URL}/api/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            
            updateLoadingProgress(0.5, "Обработка ответа от сервера...");

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: "Не удалось обработать ошибку сервера." }));
                throw new Error(errorData.error || `Ошибка сервера: ${response.status}`);
            }

            const resultData = await response.json();
            updateLoadingProgress(0.8, "Подготовка результатов...");
            await new Promise(resolve => setTimeout(resolve, 300)); // Небольшая пауза для "красоты"

            let historyEntryData = { ...resultData, timestamp: new Date() };

            if (resultData.type === "single") {
                displaySingleResult(resultData.product_name, resultData.analysis);
            } else if (resultData.type === "multi") {
                displayComparisonResult(resultData.comparison_title, resultData.individual_product_analyses, resultData.overall_recommendation);
            }
            
            addHistoryEntry(historyEntryData);
            updateLoadingProgress(1, "Анализ завершен!");
            await new Promise(resolve => setTimeout(resolve, 300));
            showScreen("results");
            resultsSection.dataset.fromHistory = "false"; // Это новый результат

        } catch (error) {
            console.error("Ошибка при обращении к API:", error);
            alert(`Произошла ошибка: ${error.message}`);
            showScreen("main");
        }
    });

    function updateLoadingProgress(value, message) {
        const progressBar = document.getElementById("progressBar");
        const loadingMessage = document.getElementById("loadingMessage");
        
        progressBar.style.width = `${value * 100}%`;
        loadingMessage.textContent = message;
    }
    
    function clearResultView() {
        // Очистка для одиночного результата
        productNameResult.textContent = "";
        analysisResultText.textContent = "";
        singleResultContainer.style.display = "none";

        // Очистка для сравнения
        comparisonOverallTitle.textContent = "";
        comparisonColumnsContainer.innerHTML = ""; // Удаляем все колонки
        overallRecommendationText.textContent = "";
        comparisonResultContainer.style.display = "none";
        delete resultsSection.dataset.fromHistory;
    }


    function displaySingleResult(productName, analysis, fromHistory = false) {
        clearResultView();
        singleResultContainer.style.display = "block";
        productNameResult.textContent = productName;
        analysisResultText.textContent = analysis;
        if (!fromHistory) { // Не сохраняем в lastResult, если это просмотр из истории
            localStorage.setItem('wbAnalyzerLastSingleResult', JSON.stringify({ productName, analysis }));
            localStorage.removeItem('wbAnalyzerLastComparisonResult'); // Очищаем другой тип результата
        }
    }

    function displayComparisonResult(title, individualAnalyses, recommendation, fromHistory = false) {
        clearResultView();
        comparisonResultContainer.style.display = "block";
        comparisonOverallTitle.textContent = title;
        overallRecommendationText.textContent = recommendation;

        comparisonColumnsContainer.innerHTML = ""; // Очищаем предыдущие колонки
        individualAnalyses.forEach(item => {
            const column = document.createElement("div");
            column.classList.add("comparison-column");

            const nameHeader = document.createElement("h4");
            nameHeader.textContent = item.product_name;
            column.appendChild(nameHeader);

            // Восстановленная оригинальная логика отображения
            if (item.review_count !== undefined) {
                const reviewCountP = document.createElement("p");
                reviewCountP.classList.add("review-count-comparison");
                reviewCountP.textContent = `(Отзывов взято для анализа: ${item.review_count})`;
                column.appendChild(reviewCountP);
            }

            const analysisP = document.createElement("div");
            analysisP.classList.add("analysis-text");
            analysisP.textContent = item.analysis;
            column.appendChild(analysisP);
            // Конец восстановленной логики

            comparisonColumnsContainer.appendChild(column);
        });
        if (!fromHistory) { // Не сохраняем в lastResult, если это просмотр из истории
            localStorage.setItem('wbAnalyzerLastComparisonResult', JSON.stringify({ title, individualAnalyses, recommendation }));
            localStorage.removeItem('wbAnalyzerLastSingleResult'); // Очищаем другой тип результата
        }
    }

    // --- Управление историей ---
    function addHistoryEntry(entryData) {
        analysisHistory.unshift(entryData); // Добавляем в начало (новые сверху)
        if (analysisHistory.length > 20) { // Ограничение на 20 записей
            analysisHistory.pop();
        }
        saveHistory();
        updateHistoryView();
    }

    function saveHistory() {
        localStorage.setItem("wbAnalyzerHistory", JSON.stringify(analysisHistory.map(entry => ({
            ...entry,
            // Преобразуем дату в строку для JSON, если это объект Date
            timestamp: entry.timestamp instanceof Date ? entry.timestamp.toISOString() : entry.timestamp 
        }))));
    }

    function loadHistory() {
        const savedHistory = localStorage.getItem("wbAnalyzerHistory");
        if (savedHistory) {
            analysisHistory = JSON.parse(savedHistory).map(entry => ({
                ...entry,
                timestamp: new Date(entry.timestamp) // Преобразуем строку обратно в Date
            }));
        } else {
            analysisHistory = [];
        }
    }

    function updateHistoryView() {
        historyList.innerHTML = ""; // Очищаем список
        if (analysisHistory.length === 0) {
            noHistoryMessage.style.display = "block";
            clearHistoryButton.disabled = true;
        } else {
            noHistoryMessage.style.display = "none";
            clearHistoryButton.disabled = false;
            analysisHistory.forEach((entry, index) => {
                const itemDiv = document.createElement("div");
                itemDiv.classList.add("history-item");
                
                const infoDiv = document.createElement("div");
                infoDiv.classList.add("history-item-info");

                const titleP = document.createElement("p");
                titleP.classList.add("history-item-title");
                let titleText = entry.type === 'single' ? entry.product_name : entry.comparison_title;
                titleP.textContent = titleText.substring(0,60) + (titleText.length > 60 ? "..." : "");


                const typeP = document.createElement("p");
                typeP.classList.add("history-item-type");
                typeP.textContent = entry.type === 'single' ? "Одиночный анализ" : "Сравнение товаров";
                
                const timeP = document.createElement("p");
                timeP.classList.add("history-item-timestamp");
                timeP.textContent = entry.timestamp.toLocaleString("ru-RU");

                infoDiv.appendChild(titleP);
                infoDiv.appendChild(typeP);
                infoDiv.appendChild(timeP);

                const actionsDiv = document.createElement("div");
                actionsDiv.classList.add("history-item-actions");

                const viewButton = document.createElement("button");
                viewButton.textContent = "Посмотреть";
                viewButton.classList.add("history-item-button", "view-history-btn");
                viewButton.addEventListener("click", () => {
                    viewHistoryEntry(entry);
                });

                const deleteButton = document.createElement("button");
                deleteButton.textContent = "Удалить";
                deleteButton.classList.add("history-item-button", "delete-history-btn");
                deleteButton.addEventListener("click", (e) => {
                    e.stopPropagation(); // Предотвращаем "просмотр" при клике на удаление
                    deleteHistoryEntry(index);
                });
                
                actionsDiv.appendChild(viewButton);
                actionsDiv.appendChild(deleteButton);

                itemDiv.appendChild(infoDiv);
                itemDiv.appendChild(actionsDiv);
                
                historyList.appendChild(itemDiv);
            });
        }
    }
    
    function viewHistoryEntry(entry) {
        if (entry.type === 'single') {
            displaySingleResult(entry.product_name, entry.analysis);
        } else if (entry.type === 'multi') {
            displayComparisonResult(entry.comparison_title, entry.individual_product_analyses, entry.overall_recommendation);
        }
        resultsSection.dataset.fromHistory = "true"; // Помечаем, что это из истории
        showScreen("results");
    }

    function deleteHistoryEntry(index) {
        if (confirm("Вы уверены, что хотите удалить эту запись из истории?")) {
            analysisHistory.splice(index, 1);
            saveHistory();
            updateHistoryView();
        }
    }

    clearHistoryButton.addEventListener("click", () => {
        if (confirm("Вы действительно хотите удалить ВСЮ историю анализов? Это действие нельзя будет отменить.")) {
            analysisHistory = [];
            saveHistory();
            updateHistoryView();
        }
    });

    // --- Загрузка последнего активного экрана и результатов ---
    function loadLastActiveScreen() {
        const lastScreen = localStorage.getItem('wbAnalyzerLastScreen');
        const lastSingleResult = localStorage.getItem('wbAnalyzerLastSingleResult');
        const lastComparisonResult = localStorage.getItem('wbAnalyzerLastComparisonResult');

        if (lastScreen === 'results') {
            if (lastSingleResult) {
                const { productName, analysis } = JSON.parse(lastSingleResult);
                displaySingleResult(productName, analysis, true); // true, чтобы не перезаписывать localStorage
                showScreen('results');
            } else if (lastComparisonResult) {
                const { title, individualAnalyses, recommendation } = JSON.parse(lastComparisonResult);
                displayComparisonResult(title, individualAnalyses, recommendation, true); // true, чтобы не перезаписывать localStorage
                showScreen('results');
            } else {
                showScreen('main'); // Если нет данных для результатов, идем на главный
            }
        } else if (lastScreen === 'history') {
            showScreen('history');
        } else {
            showScreen('main'); // По умолчанию или если lastScreen не 'results'/'history'
        }
    }
}); 