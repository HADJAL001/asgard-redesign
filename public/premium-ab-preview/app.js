/* External images are resolved via app.js asset() fallback. */
/* OSGARD Premium A/B — real, framework-free application code.
 * Scoped markup/styles, no analytics, no fake backend, no remote API.
 * Used as standalone pages or safely embedded in an existing website.
 */
(() => {
  'use strict';
  const script = document.querySelector('script[data-osgard-premium]');
  if (!script) return;
  const base = script.dataset.base || './';
  const embedded = script.dataset.mode === 'embed';
  const slug = embedded ? (script.dataset.product || 'all') : (new URLSearchParams(window.location.search).get('product') || script.dataset.product || 'all');
  const mount = document.querySelector(script.dataset.mount || '#osgard-premium-root');
  if (!mount) { console.error('OSGARD premium: no mount element'); return; }
  const STORE = 'osgard-premium-style-v1';
  let theme = 'a';
  try { theme = localStorage.getItem(STORE) === 'b' ? 'b' : 'a'; } catch (_) { /* private browsing */ }

  const products = {
    myosa: {
      name:'MYOSA', mark:'INTELLIGENCE PLATFORM', type:'AI / аналитика', site:'https://myosa.world/',
      kicker:'INTELLIGENCE FOR DECISIONS', title:'Решения\nна основе\n', highlight:'реальности.',
      description:'Объедини данные, аргументы и исследования в понятную структуру. От идеи до решения, которое можно проверить.',
      features:['Анализ источников','Сравнение альтернатив','Обоснование решений'],
      valueTitle:'Интеллект без чёрного ящика', value:'Не ещё один чат с ИИ: каждый важный вывод должен сопровождаться источниками, ограничениями и обоснованием.',
      outcomes:[['Меньше догадок','Ясно отделяй факт от предположения и модельного вывода.'],['Сравнение вариантов','Решение выглядит не текстом, а аргументированным выбором из вариантов.'],['Память решений','Следи за принятым решением, обоснованием и изменением результата.']],
      steps:[['Источники','Добавление проверенных данных','Собери документы, заметки и ссылки по одной задаче.',['Документы','Факты','Контекст']],['Анализ','Связи и противоречия','Сопоставь аргументы за и против без ложной уверенности.',['Альтернативы','Условия','Ограничения']],['Решение','План действий с обоснованием','Сформируй объяснимую рекомендацию и список проверок.',['Результат','Доказательства','Следующий шаг']],['Контроль','Проверка последствий','Возвращайся к решению и сравнивай ожидания с фактами.',['История','Ответственные','Пересмотр']]],
      color:'blue', navLabel:'Центр решений'
    },
    newworld: {
      name:'OSGARD NEW WORLD',mark:'ENGINEERING STUDIO',type:'Разработка / AI',site:'https://osgardnewworld.com/',
      kicker:'FROM IDEA TO WORKING SOFTWARE',title:'Идея.\nРазработка.\n',highlight:'Реальный продукт.',
      description:'От описания задачи до спецификации, интерфейса, кода и проверяемого результата. Создание программ должно быть прозрачным.',
      features:['Спецификация проекта','Проверяемая сборка','Путь к публикации'],
      valueTitle:'Не обещания, а подтверждённый результат',value:'Полезен не объём сгенерированного кода, а возможность запустить, проверить и поддерживать приложение.',
      outcomes:[['Сначала требования','Пользователь понимает, какие функции войдут в результат.'],['Видимые проверки','Ошибки сборки и проверок нельзя скрывать красивой анимацией.'],['Реальный контроль','Исходный код, документация и путь к публикации принадлежат проекту.']],
      steps:[['Идея','Сформулируй задачу','Опиши для кого нужен продукт и какую реальную работу он выполняет.',['Цель','Аудитория','Ограничения']],['Спецификация','Зафиксируй ожидаемый результат','Уточни страницы, данные, роли и критерии готовности.',['Экранная карта','Функции','Риски']],['Разработка','Собери рабочую версию','Свяжи интерфейс, данные и сервисные модули.',['Исходники','UI','Интеграции']],['Проверка','Подтверди качество','Проверь сценарии, доступность и сборку до публикации.',['Тесты','Ошибки','Безопасность']],['Публикация','Передай продукт в использование','Настрой развертывание и возможность безопасного отката.',['Релиз','Мониторинг','Откат']]],
      navLabel:'Фабрика приложений'
    },
    osgardos: {
      name:'OSGARDOS',mark:'ACTLEDGER / BUSINESS OPERATIONS',type:'Бизнес / управление',site:'https://osgardos.com/#/actledger',
      kicker:'BUSINESS COMMAND SYSTEM',title:'Полный контроль\n',highlight:'над бизнесом.',
      description:'Финансы, операции, ответственные и решения — в едином рабочем контуре, где каждое действие оставляет объяснимый след.',
      features:['Операционные события','Ответственность','История изменений'],
      valueTitle:'Каждое решение должно быть проверяемым',value:'Панель полезна, когда руководитель видит отклонение, причину, ответственного и то, что исправлено.',
      outcomes:[['Ясная картина','Отклонения видны раньше, чем превращаются в серьёзные потери.'],['Ответственные действия','Видно, кто должен исправить проблему и в какой срок.'],['Подтверждённый результат','Исправление закрывается фактами, а не отметкой без доказательств.']],
      steps:[['Обзор','Важное на одном экране','Приоритетные события и отклонения без шума второстепенных данных.',['События','Приоритеты','Контроль']],['Операции','Изучи первичные данные','От наблюдения перейди к операции, которая вызвала изменение.',['Фильтры','История','Детали']],['Решения','Назначь ответственного','Определи действие, срок и критерий успешного закрытия.',['Исполнитель','Срок','Статус']],['Аудит','Проверь результат','Сохрани подтверждения и историю изменений.',['След','Подтверждение','Отчёт']]],
      navLabel:'Операционный штаб'
    },
    senjorio: {
      name:'SENJORIO',mark:'PRIVATE MOBILITY',type:'Премиальные поездки',site:'https://senjorio.com/',
      kicker:'PRIVATE MOBILITY & CHAUFFEUR',title:'Премиальные\nпоездки.\n',highlight:'Без компромиссов.',
      description:'Предсказуемая поездка с вниманием к комфорту, времени и обслуживанию. Роскошь начинается с выполнения обещаний.',
      features:['Понятное бронирование','Прозрачные условия','Персональный сервис'],
      valueTitle:'Настоящий люкс — это надёжность',value:'Дорогой автомобиль на экране ничего не стоит без качественной подачи, пунктуальности и поддержки в реальности.',
      outcomes:[['Уверенность до заказа','Человек заранее понимает тип поездки и условия.'],['Прозрачная поездка','Информация о бронировании и статусе доступна в одном месте.'],['Сервис после поездки','Корпоративные документы и обратная связь — часть впечатления.']],
      steps:[['Маршрут','Выбери поездку','Укажи точку отправления, пункт назначения и дату.',['Откуда','Куда','Когда']],['Автомобиль','Выбери категорию','Сравни условия поездки и доступность подходящего класса.',['Класс','Пассажиры','Багаж']],['Подтверждение','Проверь детали','До оплаты и подтверждения клиент должен видеть финальные условия.',['Стоимость','Ожидание','Отмена']],['Поездка','Получай информацию','Следи за статусом и имей быстрый канал связи с поддержкой.',['Водитель','Статус','Поддержка']]],
      navLabel:'Частные поездки'
    },
    vanguard: {
      name:'VANGUARD',mark:'CINEMATIC AI VIDEO STUDIO',type:'Видео / производство',site:'https://osgardvanguard.studio/',
      kicker:'CINEMATIC CREATION WORKSPACE',title:'Кинематографические\nвидео.\n',highlight:'Полный контроль.',
      description:'История, персонажи, сцены, монтаж и звук в едином рабочем пространстве. Фокус на законченной истории, а не на случайных клипах.',
      features:['Раскадровка','Непрерывность персонажей','Сборка и экспорт'],
      valueTitle:'Создавать фильмы, а не фрагменты',value:'Студийная ценность начинается там, где можно управлять сценами, сохранять единый стиль и предсказуемо редактировать результат.',
      outcomes:[['Связный сценарий','Каждый новый кадр относится к общей истории.'],['Управляемые варианты','Разные версии не теряют контекст предыдущих сцен.'],['Контроль производства','Расходы на генерацию и время работы понятны до рендера.']],
      steps:[['Сценарий','Построй историю','Разбей сюжет на связанные сцены и понятные действия.',['Текст','Эпизоды','Мизансцены']],['Персонажи','Сохрани внешний вид','Определи визуальные характеристики и согласованность образов.',['Образ','Стиль','Согласованность']],['Кадры','Создай визуальный ряд','Выбирай ракурсы, версии и художественные параметры.',['Камера','Референсы','Варианты']],['Монтаж','Собери хронологию','Организуй эпизоды, длительности, звук и переходы.',['Таймлайн','Звук','Ритм']],['Экспорт','Подготовь релиз','Проверь технические требования перед выдачей результата.',['Формат','Разрешение','Проверки']]],
      navLabel:'Киностудия'
    },
    superday: {
      name:'SUPER DAY',mark:'PERSONAL DAY PLANNER',type:'Продуктивность / планирование',site:'https://superday.run/',
      kicker:'A BETTER DAY STARTS HERE',title:'Твой день.\n',highlight:'Под контролем.',
      description:'Собери дела голосом или текстом, выдели главное и начни выполнять. Меньше хаоса — больше спокойного действия.',
      features:['Фокус на главном','План по времени','Спокойный ежедневный ритм'],
      valueTitle:'Помогает прожить день, а не заполнить список',value:'Планировщик должен за несколько секунд отвечать на вопрос: что мне делать прямо сейчас?',
      outcomes:[['Быстрое начало','Один ввод вместо десятка форм и настроек.'],['Реалистичный план','Несколько главных задач и место для непредвиденного.'],['Повторное использование','Человек возвращается, потому что день действительно стал проще.']],
      steps:[['Собрать','Выгрузи все дела','Запиши или продиктуй задачи одним потоком.',['Голос','Текст','Черновик']],['Приоритеты','Найди действительно важное','Определи главные действия и отдели второстепенные.',['Фокус','Срочность','Ценность']],['Расписание','Размести задачи во времени','Учитывай доступное время и паузы.',['Календарь','Время','Резерв']],['Выполнение','Начни с одного шага','Отмечай выполненное и корректируй план по ходу дня.',['Следующее дело','Прогресс','Коррекция']]],
      navLabel:'Планировщик дня'
    },
    o2: {
      name:'O2 SYSTEM',mark:'FINANCIAL OPERATIONS',type:'Кассовый учёт / B2B',site:'https://o2system.art/',
      kicker:'FINANCIAL OPERATIONS CONTROL',title:'Надёжный учёт\nкассовых\n',highlight:'операций.',
      description:'Денежные операции, остатки, смены и история корректировок в прозрачном профессиональном интерфейсе.',
      features:['Валютные остатки','Сверка смен','Контроль действий'],
      valueTitle:'Доверие важнее эффектов',value:'В денежных операциях первостепенны точность, прослеживаемость изменений и удобство для сотрудников.',
      outcomes:[['Меньше ручных ошибок','Проверяемая структура операции и сверка по смене.'],['Прозрачность доступа','Роли и разрешения должны соответствовать обязанностям.'],['Контролируемые корректировки','Изменения требуют объяснения, а не бесследной перезаписи.']],
      steps:[['Обзор','Состояние кассы','Объединённый обзор остатков и открытых смен.',['Остатки','Смена','Валюты']],['Операция','Проверяемый ввод','Параметры операции видны до подтверждения.',['Тип','Сумма','Проверка']],['Сверка','Закрытие смены','Сверь ожидаемые и фактические суммы, разбери отклонения.',['Остатки','Расхождения','Подтверждение']],['Аудит','История действий','Восстанови последовательность операций и исправлений.',['Журнал','Ответственный','Отчёт']]],
      navLabel:'Финансовый терминал'
    }
  };
  const order = ['myosa','newworld','osgardos','senjorio','vanguard','superday','o2'];
  const asset = (name) => window.__OSGARD_OFFLINE_ASSETS?.[name] || base + 'assets/' + name;
  const sitePage = (key) => base + 'index.html?product=' + encodeURIComponent(key);
  const chosen = slug === 'all' ? null : products[slug];
  if (slug !== 'all' && !chosen) { mount.textContent='Неизвестный продукт'; return; }
  if (!embedded) document.body.classList.add('op-document');

  const root = document.createElement('div');
  root.className='op-app ' + (embedded ? 'op-embedded' : 'op-standalone');
  root.dataset.variant=theme;
  root.dataset.product=slug;
  root.setAttribute('data-build','2026-10-26-seven-sites-premium-v9');
  mount.appendChild(root);

  const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function styleControl() {
    return `<div class="op-switch" role="group" aria-label="Выберите дизайн: вариант А или вариант Б">
      <button type="button" data-set-variant="a" aria-pressed="${theme==='a'}" title="Black Chrome: фотореализм, красный луч, кинематографический стиль">Вариант A</button>
      <button type="button" data-set-variant="b" aria-pressed="${theme==='b'}" title="Executive Blue: аналитика, синий свет, профессиональная точность">Вариант B</button>
    </div>`;
  }
  function header() {
    const menu= chosen ? [
      ['#experience','Возможности'],['#workspace','Рабочий режим'],['#op-real-workspace','Инструменты'],['#variants','Оба дизайна'],['#next','Действующий сайт']
    ] : [['#products','Продукты'],['#benefits','Дизайн-система'],['#approach','Стандарт'],['#footer','Контакты']];
    const n=menu.map(([href,label])=>`<a href="${href}">${label}</a>`).join('');
    return `<a class="op-skip" href="#op-content">К содержимому</a><header class="op-topbar"><div class="op-container op-topbar-inner">
      <a class="op-brand" href="${base}index.html" aria-label="На главную галерею OSGARD">
       <span class="op-mark" aria-hidden="true"><span></span></span><span class="op-brand-name"><strong>OSGARD</strong><small>${chosen ? escape(chosen.mark) : 'PREMIUM DIGITAL ECOSYSTEM'}</small></span>
      </a>
      <nav class="op-nav" aria-label="Навигация по странице">${n}</nav>
      <div class="op-top-actions"><button type="button" class="op-command-open" data-open-command aria-haspopup="dialog" aria-label="Быстрый переход и поиск по семи продуктам">⌕ <span>Поиск</span> <kbd>Ctrl K</kbd></button>${styleControl()}<span class="op-top-note">Два визуальных решения<br>одна система</span><a class="op-btn op-btn-secondary" href="${chosen ? base + 'index.html' : '#products'}">${chosen ? 'Все 7 проектов' : 'Коллекция'}</a><button class="op-menu-btn" type="button" aria-controls="op-mobile-nav" aria-expanded="false" aria-label="Открыть меню"><i></i><i></i><i></i></button></div>
    </div><nav id="op-mobile-nav" class="op-mobile-nav" aria-label="Мобильное меню" data-open="false">${n}<a href="${base}index.html">Все семь продуктов</a></nav></header>`;
  }
  function footer() {
    return `<footer class="op-footer" id="footer"><div class="op-container op-footer-inner"><small>OSGARD Premium A/B · Дизайн и код интерактивного прототипа. Арт-референсы и любые цифры внутри иллюстраций не подтверждают настоящие показатели продуктов. Текущие приложения и их данные не изменяются этой демосборкой.</small><a href="${base}index.html">Все продукты ↗</a></div></footer>`;
  }
  function gallery() {
    const cards=order.map(key=>{
      const x=products[key];
      return `<a class="op-shot op-shot--${key}" data-is-concept="true" href="${sitePage(key)}" aria-label="${escape(x.name)} — открыть отдельную реализацию дизайна A/B">
        <img src="${asset('card-'+theme+'-'+key+'.webp')}" alt="${escape(x.name)}: авторский визуальный референс ${theme.toUpperCase()}" loading="eager" decoding="async" data-art-key="${key}" data-art-kind="card">
        <div class="op-shot-label"><span>${escape(x.type)}</span><b>Открыть продукт ↗</b></div>
      </a>`;
    }).join('');
    return `${header()}<main id="op-content"><section class="op-intro op-container" id="intro"><p class="op-kicker">OSGARD / THE SEVEN PRODUCTS / 2026</p>
      <div class="op-intro-line"><div><h1>Семь продуктов.<br><em>Два характера.</em></h1><p class="op-lead">Утверждённые фотореалистичные референсы стали работающей системой из двух премиальных дизайнов. Переключай A/B сверху — изображения и интерфейс изменяются без перезагрузки.</p></div><div class="op-intro-badge"><span class="op-dot"></span> BLACK CHROME<br>EXECUTIVE BLUE</div></div></section>
      <section class="op-container" id="products" aria-label="Все семь сайтов"><div class="op-gallery">${cards}</div><p class="op-text-muted" style="font-size:11px;text-align:center;max-width:870px;margin:0 auto">Визуальные карточки — концептуальные иллюстрации по двум выбранным референсам. Метрики и детали внутри сгенерированных изображений не являются фактической статистикой сайтов.</p></section>
      <section class="op-section op-container" id="benefits"><div class="op-section-head"><p class="op-kicker">THE DESIGN LANGUAGE</p><h2>Вау — на входе.<br>Точность — в работе.</h2><p>Презентационная режиссура и профессиональный интерфейс — разные задачи. Каждый продукт получает свою архитектуру без мультяшного CGI и вымышленных результатов.</p></div><div class="op-benefits">
       <article class="op-benefit"><span class="op-benefit-no">01 / ART DIRECTION</span><h3>Фотореалистичный премиум</h3><p>Хром, стекло, настоящий объём, мягкие отражения, дорогие автомобильные и индустриальные кадры.</p></article>
       <article class="op-benefit"><span class="op-benefit-no">02 / PRODUCT UX</span><h3>Действие важнее декора</h3><p>Не более одного главного сценария на экран, осмысленные статусы, реальные переходы и фокус на полезном результате.</p></article>
       <article class="op-benefit"><span class="op-benefit-no">03 / TWO VERSIONS</span><h3>Вариант A и вариант B</h3><p>Настоящее переключение стиля с сохранением выбора на этом домене. Поддержка клавиатуры, мобильных экранов и reduced-motion.</p></article>
      </div></section><section class="op-container" id="approach"><div class="op-final"><div><p class="op-kicker">IMPLEMENTATION READY</p><h2>Открой любой из семи продуктов.</h2><p>У каждого есть отдельная рабочая страница, визуал A/B, интерактивный прототип рабочего режима и ссылка на действующий сайт без подмены его функциональности.</p></div><a class="op-btn op-btn-primary" href="${sitePage('myosa')}">Перейти к MYOSA <span class="op-arrow">↗</span></a></div></section></main>${footer()}`;
  }
  function hero(p) {
    const primaryHref = embedded && script.dataset.actionHref ? script.dataset.actionHref : p.site;
    const primaryTarget = /^https?:\/\//i.test(primaryHref) ? ' target="_blank" rel="noopener noreferrer"' : '';
    const title = escape(p.title).replace(/\n/g,'<br>')+`<strong>${escape(p.highlight)}</strong>`;
    const chips=p.features.map(f=>`<span><i class="op-dot"></i>${escape(f)}</span>`).join('');
    return `<section class="op-product-hero" id="op-content"><div class="op-container op-hero-grid">
      <div class="op-hero-copy"><p class="op-kicker">${escape(p.kicker)}</p><h1>${title}</h1><p class="op-hero-desc">${escape(p.description)}</p>
        <div class="op-hero-buttons"><a class="op-btn op-btn-primary" href="${embedded ? escape(primaryHref) : '#op-real-workspace'}"${embedded ? primaryTarget : ''}>${embedded ? 'Перейти в приложение' : 'Открыть рабочий прототип'} <span class="op-arrow">↗</span></a><a class="op-btn op-btn-secondary" href="${escape(p.site)}" target="_blank" rel="noopener noreferrer">Действующий сайт <span class="op-arrow">↗</span></a></div>
        <div class="op-hero-facts">${chips}</div>
      </div><div class="op-visual-stage"><div class="op-scanline" aria-hidden="true"></div><img class="op-main-art" src="${asset('hero-'+theme+'-'+slug+'.webp')}" alt="Визуальный концепт ${escape(p.name)} в утверждённой стилистике ${theme.toUpperCase()}" data-art-key="${slug}" data-art-kind="hero" loading="eager" decoding="async">
       <div class="op-visual-hud" aria-hidden="true"><strong>${escape(p.name)} / CONCEPT</strong>${p.features.map(f=>`<span>${escape(f)}</span>`).join('')}</div><span class="op-art-label">Визуальный концепт, не скриншот приложения</span></div></div></section>`;
  }
  function content(p,includeComparison) {
    const cards=p.outcomes.map(([title,body],i)=>`<article class="op-benefit"><span class="op-benefit-no">0${i+1} / VALUE</span><h3>${escape(title)}</h3><p>${escape(body)}</p></article>`).join('');
    const steps=p.steps.map((a,i)=>`<button type="button" data-step="${i}" aria-current="${i===0?'step':'false'}"><b>${String(i+1).padStart(2,'0')}</b>${escape(a[0])}</button>`).join('');
    return `<div class="op-container"><div class="op-meta-strip"><span class="op-meta-key">${escape(p.name)}</span><span><strong>Система:</strong> Dual Mode A/B</span><span><strong>Статус:</strong> визуальный фронтенд-прототип</span><span><strong>Интеграция:</strong> без изменения логики текущего приложения</span></div></div>
      <section class="op-section op-container" id="experience"><div class="op-section-head"><p class="op-kicker">BETTER PRODUCT DESIGN</p><h2>${escape(p.valueTitle)}</h2><p>${escape(p.value)}</p></div><div class="op-benefits">${cards}</div></section>
      <section class="op-section op-container" id="workspace"><div class="op-section-head"><p class="op-kicker">LIVE INTERFACE EXPERIENCE</p><h2>Рабочий режим.<br>Никакого визуального шума.</h2><p>Кликни по этапам слева: содержание, заголовок, заметки и параметры изменятся прямо на странице. Это работающий фронтенд без притворной серверной обработки.</p></div>
       <div class="op-workbench"><div class="op-workbench-sidebar"><div class="op-workbench-logo">${escape(p.name)}</div>${steps}</div><div class="op-workbench-main"><div class="op-workbench-top"><span class="op-kicker">${escape(p.navLabel)} / DEMO</span><small>Интерактивная демонстрация, без реальных данных</small></div><div class="op-workbench-content"><div class="op-demo-primary"><p class="op-kicker" data-step-label>Этап 01 / ${escape(p.steps[0][0])}</p><h3 data-step-title>${escape(p.steps[0][1])}</h3><p data-step-body>${escape(p.steps[0][2])}</p><div class="op-demo-chip-row" data-step-chips>${p.steps[0][3].map(z=>`<span class="op-demo-chip">${escape(z)}</span>`).join('')}</div></div><div class="op-demo-side"><div class="op-demo-stat"><small>Принцип продукта</small><strong>Понятный результат</strong><div class="op-demo-bar"><i></i></div></div><div class="op-demo-stat"><small>Подтверждение действий</small><strong>Явное и проверяемое</strong><div class="op-demo-bar"><i style="width:79%"></i></div></div><div class="op-demo-warning">Все данные в этой области — элементы интерфейсного прототипа, не сведения о клиентах.</div></div></div></div></div>
       <div class="op-timeline" aria-label="Этапы сценария" style="margin-top:13px">${p.steps.map((a,i)=>`<button type="button" data-step="${i}" aria-pressed="${i===0}"><b>${i+1}</b>${escape(a[0])}</button>`).join('')}</div>
      </section>
      ${includeComparison ? comparison(p) : ''}
      <section class="op-container" id="next"><div class="op-final"><div><p class="op-kicker">NEXT ACTION</p><h2>Дизайн не должен ломать продукт.</h2><p>Эта версия демонстрирует два утверждённых визуальных режима и рабочие UI-сценарии. Для внедрения в действующий сайт нужен доступ к его исходникам или безопасное добавление изолированного компонента.</p></div><a class="op-btn op-btn-primary" href="${escape(p.site)}" target="_blank" rel="noopener noreferrer">Действующий ${escape(p.name)} <span class="op-arrow">↗</span></a></div></section>`;
  }
  function comparison(p) {
    return `<section class="op-section op-container" id="variants"><div class="op-section-head"><p class="op-kicker">TWO APPROVED DIRECTIONS</p><h2>Два премиальных решения.<br>Один клик.</h2><p>Выбор не сбрасывается при переходе между продуктами в этой галерее.</p></div><div class="op-compare">
     ${['a','b'].map(t=>`<article class="op-compare-item ${theme===t?'op-compare-active':''}" data-variant-card="${t}"><img src="${asset('card-'+t+'-'+slug+'.webp')}" loading="lazy" alt="${escape(p.name)} — утверждённая концепция ${t.toUpperCase()}"><div class="op-compare-details"><div><strong>Вариант ${t.toUpperCase()}</strong><p>${t==='a'?'Black Chrome / Cinematic':'Executive Blue / Product-first'}</p></div><button class="op-btn ${theme===t?'op-btn-primary':'op-btn-secondary'}" type="button" data-set-variant="${t}" aria-pressed="${theme===t}">${theme===t?'Выбран ✓':'Выбрать →'}</button></div></article>`).join('')}
    </div></section>`;
  }
  function siteMarkup(p){return header()+`<main>${hero(p)}${content(p,!embedded)}</main>`+footer();}
  function embeddedMarkup(p) {
    return `<section class="op-embed-shell" aria-label="Премиальный дизайн ${escape(p.name)}"><div class="op-embed-bar"><span class="op-kicker">${escape(p.name)} / PREMIUM DESIGN</span>${styleControl()}</div>${hero(p)}</section>`;
  }
  function palette(){
    if (embedded) return '';
    const links=order.map(key=>`<a class="op-command-entry" href="${sitePage(key)}" data-command-item data-command-text="${escape(products[key].name+' '+products[key].type+' '+products[key].navLabel)}"><span class="op-command-icon">↗</span><span><strong>${escape(products[key].name)}</strong><small>${escape(products[key].type)}</small></span><span class="op-command-arrow">↗</span></a>`).join('');
    const sections=chosen ? [['#experience','Преимущества'],['#workspace','Сценарий работы'],['#op-real-workspace','Рабочий инструмент'],['#variants','Сравнить A/B'],['#next','Действующее приложение']] : [['#products','Все продукты'],['#benefits','Дизайн-система'],['#approach','Дальнейшие шаги']];
    return `<dialog class="op-command-dialog" aria-label="Быстрый переход и поиск"><div class="op-command-head"><span>БЫСТРЫЙ ПЕРЕХОД / OSGARD</span><button type="button" data-close-command aria-label="Закрыть окно поиска">✕</button></div><label class="op-command-search"><span class="op-sr-only">Название продукта или раздела</span><input type="search" data-command-search autocomplete="off" placeholder="Найти продукт или раздел…"></label><div class="op-command-list" role="list">${sections.map(([href,label])=>`<a class="op-command-entry" href="${href}" data-command-item data-command-text="${escape(label)}"><span class="op-command-icon">⌗</span><strong>${escape(label)}</strong><span class="op-command-arrow">↗</span></a>`).join('')}${links}</div><p class="op-command-empty" hidden>Ничего не найдено. Попробуй другой запрос.</p><div class="op-command-foot">↑ ↓ — выбор · Enter — перейти · Esc — закрыть</div></dialog>`;
  }
  function rendered(){
      root.innerHTML=(embedded && chosen ? embeddedMarkup(chosen) : chosen ? siteMarkup(chosen) : gallery())+palette();
      if(!chosen && !embedded){
        const main=root.querySelector('main'), products=root.querySelector('#products'), intro=root.querySelector('#intro');
        if(main&&products&&intro)main.insertBefore(products,intro);
      }
    }
  function applyTheme(t){
    if(t!=='a' && t!=='b')return false;
    const changed=theme!==t;
    theme=t;root.dataset.variant=t;
    try{localStorage.setItem(STORE,t);}catch(_){}
    root.querySelectorAll('[data-set-variant]').forEach(btn=>{const active=btn.dataset.setVariant===t;btn.setAttribute('aria-pressed',String(active));if(btn.closest('.op-compare-details')){btn.textContent=active?'Выбран ✓':'Выбрать →';btn.classList.toggle('op-btn-primary',active);btn.classList.toggle('op-btn-secondary',!active);}});
    root.querySelectorAll('[data-variant-card]').forEach(card=>card.classList.toggle('op-compare-active',card.dataset.variantCard===t));
    root.querySelectorAll('img[data-art-kind]').forEach(img=>{const src=asset(img.dataset.artKind+'-'+t+'-'+img.dataset.artKey+'.webp');if(img.getAttribute('src')!==src)img.src=src;});
    if(changed)root.dispatchEvent(new CustomEvent('osgard:variant-change',{bubbles:true,detail:{variant:t}}));
    return true;
  }
  function setStep(i){
    if(!chosen||!chosen.steps[i])return;
    const [label,title,body,chips]=chosen.steps[i];
    const t=root.querySelector('[data-step-title]');if(!t)return;
    t.textContent=title;
    root.querySelector('[data-step-label]').textContent='Этап '+String(i+1).padStart(2,'0')+' / '+label;
    root.querySelector('[data-step-body]').textContent=body;
    root.querySelector('[data-step-chips]').replaceChildren(...chips.map(c=>{const span=document.createElement('span');span.className='op-demo-chip';span.textContent=c;return span;}));
    root.querySelectorAll('button[data-step]').forEach(b=>{
      const is=b.dataset.step===String(i);
      if(b.hasAttribute('aria-pressed'))b.setAttribute('aria-pressed',String(is));
      if(b.hasAttribute('aria-current'))b.setAttribute('aria-current',is?'step':'false');
    });
  }
  rendered();
  let commandTrigger=null;
  const dialog=()=>root.querySelector('.op-command-dialog');
  const visibleCommands=()=>Array.from(root.querySelectorAll('[data-command-item]')).filter(x=>!x.hidden);
  function showCommands(trigger){
    const dlg=dialog();if(!dlg)return;
    commandTrigger=trigger||document.activeElement;
    if(!dlg.open){dlg.showModal();}
    const inp=dlg.querySelector('[data-command-search]');inp.value='';filterCommands('');inp.focus();
  }
  function closeCommands(){const dlg=dialog();if(dlg?.open){dlg.close();if(commandTrigger&&commandTrigger.isConnected)commandTrigger.focus();}}
  function filterCommands(term){
    const needle=String(term||'').trim().toLocaleLowerCase('ru');
    const entries=Array.from(root.querySelectorAll('[data-command-item]'));
    entries.forEach(x=>{x.hidden=!x.dataset.commandText.toLocaleLowerCase('ru').includes(needle);});
    root.querySelector('.op-command-empty').hidden=entries.some(x=>!x.hidden);
  }
  root.addEventListener('input',e=>{if(e.target.matches('[data-command-search]'))filterCommands(e.target.value);});
  root.addEventListener('click',e=>{
    const dlg=dialog();
    if(dlg?.open && e.target===dlg)closeCommands();
  });
  root.addEventListener('click',e=>{
    const open=e.target.closest('[data-open-command]');if(open){showCommands(open);return;}
    if(e.target.closest('[data-close-command]')){closeCommands();return;}
    if(e.target.closest('[data-command-item]')){closeCommands();}
  });
  root.addEventListener('keydown',e=>{
    const dlg=dialog();if(!dlg?.open)return;
    if(e.key==='Escape'){e.preventDefault();closeCommands();return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      const items=visibleCommands();if(!items.length)return;
      const idx=items.indexOf(document.activeElement);
      items[(idx+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();e.preventDefault();
    } else if(e.key==='Enter'&&e.target.matches('[data-command-search]')){
      const first=visibleCommands()[0];if(first){e.preventDefault();first.click();}
    }
  });
  window.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
      e.preventDefault();if(dialog()?.open)closeCommands();else showCommands(e.target);
    }
  });
  root.addEventListener('click',(e)=>{
    const btn=e.target.closest('button');if(!btn)return;
    if(btn.dataset.setVariant){applyTheme(btn.dataset.setVariant);return;}
    if(btn.dataset.step){setStep(Number(btn.dataset.step));return;}
    if(btn.classList.contains('op-menu-btn')){
      const nav=root.querySelector('#op-mobile-nav'); const open=nav.dataset.open!=='true';nav.dataset.open=String(open);btn.setAttribute('aria-expanded',String(open));btn.setAttribute('aria-label',open?'Закрыть меню':'Открыть меню');
    }
  });
  root.addEventListener('click',(e)=>{
    if(e.target.closest('.op-mobile-nav a')){
      const nav=root.querySelector('#op-mobile-nav'),btn=root.querySelector('.op-menu-btn');if(!nav||!btn)return;nav.dataset.open='false';btn.setAttribute('aria-expanded','false');btn.setAttribute('aria-label','Открыть меню');
    }
  });
  root.addEventListener('keydown', e=>{
    if(e.key==='Escape'){
      const nav=root.querySelector('#op-mobile-nav'),btn=root.querySelector('.op-menu-btn');if(nav?.dataset.open==='true'&&btn){nav.dataset.open='false';btn.setAttribute('aria-expanded','false');btn.focus();}
    }
  });
  // One event for every successful variant switch, including API and shortcuts.
  const originalApply=applyTheme;
  window.OSGARD_PREMIUM = window.OSGARD_PREMIUM || {};
  window.OSGARD_PREMIUM.version='9.0.0';
  window.OSGARD_PREMIUM.setVariant=(variant)=>originalApply(String(variant).toLowerCase());
  window.OSGARD_PREMIUM.getVariant=()=>theme;
  window.OSGARD_PREMIUM.products=order.slice();
  window.addEventListener('storage',(event)=>{
    if(event.key===STORE && ['a','b'].includes(event.newValue))applyTheme(event.newValue);
  });
  root.addEventListener('keydown',(event)=>{
    if(event.altKey&&!event.ctrlKey&&!event.metaKey&&(['1','2'].includes(event.key))){
      event.preventDefault();applyTheme(event.key==='1'?'a':'b');
    }
  });
})();
