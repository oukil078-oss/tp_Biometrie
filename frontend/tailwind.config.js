/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: 'hsl(var(--card))',
        'card-foreground': 'hsl(var(--card-foreground))',
        primary: 'hsl(var(--primary))',
        'primary-foreground': 'hsl(var(--primary-foreground))',
        secondary: 'hsl(var(--secondary))',
        'secondary-foreground': 'hsl(var(--secondary-foreground))',
        muted: 'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        accent: 'hsl(var(--accent))',
        'accent-foreground': 'hsl(var(--accent-foreground))',
        destructive: 'hsl(var(--destructive))',
        'destructive-foreground': 'hsl(var(--destructive-foreground))',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      keyframes: {
        'fade-in': { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'scale-in': { '0%': { transform: 'scale(0.95)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        'pulse-ring': { '0%': { transform: 'scale(0.8)', opacity: '0.5' }, '50%': { transform: 'scale(1.1)', opacity: '0.3' }, '100%': { transform: 'scale(0.8)', opacity: '0.5' } },
      },
      animation: { 'fade-in': 'fade-in 0.4s ease-out', 'scale-in': 'scale-in 0.3s ease-out', 'pulse-ring': 'pulse-ring 1.5s ease-in-out infinite' },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'], mono: ['JetBrains Mono', 'ui-monospace', 'monospace'] },
      boxShadow: { glow: '0 0 40px -10px rgba(99,102,241,0.3)', 'glow-lg': '0 0 60px -15px rgba(99,102,241,0.4)', 'glow-sm': '0 0 20px -5px rgba(99,102,241,0.2)' },
    },
  },
  plugins: [],
}
