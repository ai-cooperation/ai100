---
layout: default
title: "iPAS 考試重點補充"
permalink: /ipas/
---

<div class="ipas-index">

<!-- 學習系統入口 -->
<a href="{{ '/classroom/learn' | relative_url }}" style="display:block;text-decoration:none;margin-bottom:2rem;">
<div style="background:linear-gradient(135deg,#0B3C5D,#1A73E8);border-radius:16px;padding:2rem;color:#fff;text-align:center;border:3px solid #FFC857;position:relative;overflow:hidden;">
  <div style="position:absolute;top:-20px;right:-20px;width:100px;height:100px;background:rgba(255,200,87,.15);border-radius:50%;"></div>
  <div style="position:absolute;bottom:-30px;left:-30px;width:120px;height:120px;background:rgba(255,255,255,.05);border-radius:50%;"></div>
  <p style="font-size:.85rem;color:rgba(255,255,255,.7);margin-bottom:.5rem;">iPAS AI 應用規劃師</p>
  <h2 style="font-size:1.6rem;font-weight:900;margin:0;line-height:1.4;">
    2026 新型態情境學習系統
  </h2>
  <p style="margin:.8rem 0 0;font-size:.95rem;color:rgba(255,255,255,.85);">
    三問法 × AI 動態出題 × 盲區追蹤 — 不是刷題，是建立判斷框架
  </p>
  <span style="display:inline-block;margin-top:1rem;padding:.5rem 1.5rem;background:#FFC857;color:#0B3C5D;border-radius:100px;font-weight:700;font-size:.9rem;">
    點擊進入系統 →
  </span>
</div>
</a>

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
