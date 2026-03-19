<div align="center" dir="rtl">

# OpenAGS

**العالم المستقل العام المفتوح**

إطار عمل مفتوح المصدر للبحث العلمي المستقل بالكامل — من مراجعة الأدبيات إلى كتابة المخطوطات.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-3776ab.svg)](https://python.org)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org)

[البدء السريع](#البدء-السريع) &bull; [الهندسة المعمارية](#الهندسة-المعمارية) &bull; [التوثيق](../architecture.md) &bull; [الاستشهاد](#الاستشهاد)

[English](../../README.md) | [中文](ZH.md) | [日本語](JA.md) | [Français](FR.md) | [Deutsch](DE.md) | العربية

</div>

---

<div dir="rtl">

يقوم OpenAGS بتنسيق فريق من وكلاء الذكاء الاصطناعي الذين يتعاونون عبر دورة البحث الكاملة — مراجعة الأدبيات، توليد الفرضيات، التجارب، كتابة المخطوطات، ومراجعة الأقران. إطار عمل واحد، من البداية إلى النهاية، مستقل بالكامل.

</div>

<div align="center">
  <img src="../images/OpenAGS-Desktop1.jpg" alt="OpenAGS Desktop">
  <br>
  <sub>OpenAGS Desktop — مساحة عمل بحثية متعددة الوكلاء مع محرر LaTeX مدمج</sub>
</div>

---

<div dir="rtl">

## البدء السريع

### التثبيت

</div>

```bash
git clone https://github.com/openags/OpenAGS.git
cd OpenAGS
uv sync
```

<div dir="rtl">

إعداد مزود LLM:

</div>

```bash
uv run openags config default_backend.model deepseek/deepseek-chat
uv run openags config default_backend.api_key sk-your-key
```

<div dir="rtl">

### التشغيل

</div>

```bash
# تطبيق سطح المكتب (Electron)
cd desktop && pnpm install && pnpm dev

# وضع المتصفح (بدون Electron)
cd desktop && pnpm build && pnpm serve    # → http://localhost:3001

# CLI فقط
uv run openags init my-project --name "بحثي"
uv run openags chat my-project
```

---

<div dir="rtl">

## الهندسة المعمارية

</div>

```
React UI (متصفح + Electron)
    ↓ WebSocket + HTTP
خادم Node.js (Express)
  /chat  → Claude SDK, Codex SDK, Cursor CLI, Gemini CLI
  /shell → طرفية PTY (node-pty)
  /api/* → وكيل إلى الخادم الخلفي Python
    ↓ HTTP
الخادم الخلفي Python (FastAPI)
  المنسق → حلقة الوكيل → المهارات → الأدوات → الذاكرة
    ↓
الخدمات الخارجية: واجهات LLM، arXiv، Semantic Scholar، Docker، SSH
```

<div dir="rtl">

## المزودون المدعومون

**LLM (عبر LiteLLM — أكثر من 100 مدعوم)**: DeepSeek، OpenAI، Anthropic، Google، OpenRouter، Ollama، إلخ

**واجهات وكيل CLI الخلفية**: Claude Code، Codex، Cursor، Gemini CLI

</div>

---

## Star History

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=openags/OpenAGS&type=Date)](https://star-history.com/#openags/OpenAGS&Date)

</div>

<div dir="rtl">

## الاستشهاد

</div>

```bibtex
@article{zhang2025scaling,
  title   = {Scaling Laws in Scientific Discovery with AI and Robot Scientists},
  author  = {Zhang, Pengsong and Zhang, Heng and Xu, Huazhe and Xu, Renjun and
             Wang, Zhenting and Wang, Cong and Garg, Animesh and Li, Zhibin and
             Ajoudani, Arash and Liu, Xinyu},
  journal = {arXiv preprint arXiv:2503.22444},
  year    = {2025}
}
```

<div dir="rtl">

## الترخيص

</div>

[MIT](LICENSE)
