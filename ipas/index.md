---
layout: default
title: "iPAS 考試重點補充"
permalink: /ipas/
---

<div class="ipas-index">

<h1>iPAS AI 應用規劃師 — 2026 考點補充</h1>

<p class="hero-subtitle">
根據 2026 年最新命題趨勢與企業導入實務分析，針對正課涵蓋較淺的高頻考點，提供深度補充教材。
</p>

<div class="ipas-module-grid">
{% for topic in site.data.ipas_topics %}
<a href="{{ topic.url | relative_url }}" class="ipas-module-card">
  <div class="ipas-module-cover">
    <img src="{{ '/assets/images/ipas/' | append: topic.id | append: '.png' | relative_url }}" alt="{{ topic.title }}" loading="lazy">
    <span class="ipas-module-icon">{{ topic.icon }}</span>
  </div>
  <div class="ipas-module-info">
    <h3>{{ topic.title }}</h3>
    <p>{{ topic.description }}</p>
    <div class="ipas-module-meta">
      <span class="ipas-module-related">關聯正課</span>
      {% for lid in topic.related_lectures %}
      <span class="tag">{{ lid }}</span>
      {% endfor %}
    </div>
  </div>
</a>
{% endfor %}
</div>

<div class="ipas-usage">
<h3>使用建議</h3>
<ul>
<li><strong>搭配正課</strong>：每個補充主題都標示關聯講座，建議先完成正課再深入補充內容</li>
<li><strong>考試重點</strong>：標示「考試重點」與「常見題型」，方便考前快速複習</li>
<li><strong>場景導向</strong>：以「規劃師」而非「工程師」的角度切入，重「為什麼選」而非「怎麼做」</li>
</ul>
</div>

</div>
