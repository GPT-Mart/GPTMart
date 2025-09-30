// Define a global array the app can read.
window.GPTS = [
  {
    id: "python-pro",
    name: "Python Pro Coach",
    description: "Ask me for idiomatic Python, code reviews, and quick scripts.",
    category: "Programming",
    language: "Python",
    tags: ["python", "code", "tips"],
    url: "https://chat.openai.com/g/gpt-python-pro-coach",
    icon: "🐍"
  },
  {
    id: "bash-wizard",
    name: "Bash Wizard",
    description: "Master shell one-liners, loops, grep/sed/awk, and safe scripts.",
    category: "Programming",
    language: "Bash",
    tags: ["bash", "cli", "linux"],
    url: "https://chat.openai.com/g/gpt-bash-wizard",
    icon: "💻"
  },
  {
    id: "ml-mentor",
    name: "ML Mentor",
    description: "Learn ML step by step with examples, math, and intuition.",
    category: "AI & ML",
    language: "Python",
    tags: ["ml", "ai", "pytorch", "tensorflow"],
    url: "https://chat.openai.com/g/gpt-ml-mentor",
    icon: "🧠"
  },
  {
    id: "web-ux",
    name: "Web & UX Stylist",
    description: "Responsive layouts, modern CSS, UI polish, accessibility.",
    category: "Web",
    language: "HTML/CSS",
    tags: ["css", "ui", "design", "a11y"],
    url: "https://chat.openai.com/g/gpt-web-ux-stylist",
    icon: "🎨"
  }
];

// (Optional) expose a list of languages you care about
window.GPT_LANGUAGES = ["Python", "Bash", "HTML/CSS", "JavaScript", "TypeScript"];
