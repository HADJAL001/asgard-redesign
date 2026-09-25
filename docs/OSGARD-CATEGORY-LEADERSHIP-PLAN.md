# OSGARD: план лидерства над AI-конструкторами

**Scope:** только `osgardnewworld.com` и `asgard-redesign`.

## Короткий ответ

OSGARD уже сильнее типичного конструктора в доказуемости результата: ProductContract, tenant-bound evidence, quality gates, rollback, Product Graph, Mission Replay и футуристический hull-интерфейс уже работают.

Но OSGARD пока нельзя честно назвать лучше Lovable, Bolt.new и Tilda во всех направлениях. У конкурентов зрелее мгновенный first preview, визуальное редактирование, шаблоны, совместная работа и one-click публикация. Наше преимущество станет решающим только когда эти сценарии будут соединены с нашим evidence-backed control plane.

## Каким должен быть основной сценарий

```text
Idea → AI interview → visual storyboard → live app preview → edit by voice/text/canvas
     → automatic quality gates → human approval → domain/provider deploy → replayable evidence
```

Пользователь может сказать: «Собери маркетплейс для локальных дизайнеров в стиле Diamond Cosmos». Система должна:

1. задать не больше 3 уточняющих вопросов;
2. показать Product Catalog, Visual DNA и storyboard экранов;
3. собрать безопасный ProductContract и объяснить решения простым языком;
4. показать рабочий preview до codegen;
5. принимать команды «сделай карточки плотнее», «добавь Stripe», «сделай мобильную версию»;
6. показывать diff каждого изменения и мгновенный rollback;
7. сама прогнать security, a11y, performance, visual-diff и deploy gates;
8. опубликовать на выбранный provider только после явного approval.

## Сравнение

| Направление | OSGARD сейчас | Что нужно для лидерства |
| --- | --- | --- |
| Идея → blueprint | Есть AI Cofounder, starter missions и typed contract | AI interview с 3 вопросами и сохранением intent в Product Graph |
| Визуальный wow | Diamond Cosmos, hull, orbital memory, motion, reduced motion | Visual storyboard и branded component variants до codegen |
| Редактирование | Blueprint Canvas, revisions, undo/redo | Natural-language edit loop с explainable diff и multi-select canvas |
| Preview | Безопасный render plan и retry | Первый live preview менее чем за 60 секунд, streaming progress |
| Качество | Evidence Ledger, gates, Product Graph | Golden tasks, visual regression attachments и public proof panel |
| Код и безопасность | Guarded components, approval, sandbox roadmap | Isolated sandbox, signed artifact, dependency/security report |
| Публикация | Delivery policy и provider metadata | Domain/DNS/Supabase wizard, canary, health check и rollback |
| Командная работа | Tenant boundary и replay link | Comments, presence, approvals и shareable review room |
| Универсальность | web/dashboard/marketplace/AI-tool profiles | mobile/PWA/API templates и portable export |
| Обучение системы | Telemetry и ACE direction | Только production-backed playbook updates и benchmark gateway |

## Приоритет внедрения

### Фаза 1: 0–30 дней — fastest path to value

- AI interview: intent, audience, platform, success metric; максимум 3 вопроса.
- Visual storyboard из 5 сцен: idea, architecture, build, preview, approval.
- First preview SLA: p50 < 60 s, p95 < 180 s.
- Natural-language edit commands для безопасных canvas slots.
- Метрики: time-to-first-preview, first-pass acceptance, edit success rate, preview failure recovery.

### Фаза 2: 31–90 дней — verified builder

- Live preview session с diff между revisions.
- Golden tasks для website, dashboard, marketplace, mobile shell и AI tool.
- Public Evidence Panel без секретов.
- Domain/provider/Supabase wizard с реальными preflight adapters.
- Signed build artifact и isolated sandbox evidence.
- Цели: task success > 90%, a11y zero critical violations, LCP < 2.5 s, INP < 200 ms, CLS < 0.1.

### Фаза 3: 3–12 месяцев — ecosystem moat

- Multi-user review room и approval comments.
- Verified ACE Playbook marketplace.
- Model gateway по latency, cost, risk и benchmark.
- Portable project export: contract, graph, evidence, design DNA и generated source.
- Tenant policy packs и privacy-preserving aggregate learning.

### Фаза 4: 1–3 года — category ownership

- Product Graph в Postgres с RLS и pgvector references.
- Multi-agent typed handoffs, canary deploy и automatic rollback.
- Predictive architecture checks по истории golden tasks.

## Что считать «лучше»

Не обещать «100x» без измерения. На каждом квартале сравнивать OSGARD с Lovable, Bolt.new и Tilda на одинаковых golden tasks:

- time-to-first-preview;
- task success rate;
- first-pass acceptance;
- escaped defects после deploy;
- rollback time;
- WCAG/axe violations;
- LCP/INP/CLS;
- стоимость успешного результата;
- доля изменений с provenance и evidence;
- visual appeal score по blind review.

Категорийное преимущество OSGARD: конкуренты оптимизируют скорость генерации, а OSGARD должен оптимизировать **скорость до проверенного, объяснимого и переносимого результата**.

## Definition of Done для мирового уровня

Функция не считается готовой, пока у неё нет:

- typed contract и tenant boundary;
- visible user explanation;
- keyboard/a11y states;
- loading, empty, failure и retry states;
- performance budget;
- visual regression;
- telemetry event в allowlist;
- evidence link в Product Graph;
- rollback path;
- production smoke check.

## Ближайшие задачи в репозитории

1. AI interview state machine и intent schema.
2. Storyboard component с streaming stages.
3. Natural-language canvas edit endpoint с diff preview.
4. Golden-task runner и evidence attachments.
5. Delivery wizard поверх текущего preflight.

Этот документ является рабочей стратегией, а не утверждением, что все перечисленные фазы уже реализованы.
