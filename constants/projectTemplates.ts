/**
 * Project Templates
 *
 * Pre-built project templates for common use cases.
 * Each template contains a complete FileSystem ready to use.
 */

import type { FileSystem } from '@/types';

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  category: 'dashboard' | 'landing' | 'form' | 'ecommerce' | 'portfolio';
  icon: string; // lucide-react icon name
  previewColor: string; // Tailwind gradient classes
  files: FileSystem;
  features: string[];
}

// Base configuration files (shared across all templates)
const BASE_PACKAGE_JSON = JSON.stringify({
  name: "fluidflow-app",
  version: "1.0.0",
  private: true,
  type: "module",
  scripts: {
    dev: "vite",
    build: "vite build",
    preview: "vite preview"
  },
  dependencies: {
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "lucide-react": "^0.561.0",
    "motion": "^12.0.0",
    "react-router": "^7.1.0",
    "recharts": "^2.15.0"
  },
  devDependencies: {
    "@vitejs/plugin-react": "^5.1.0",
    "vite": "^7.2.0",
    "@tailwindcss/vite": "^4.1.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.9.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@types/node": "^25.0.0"
  }
}, null, 2);

const BASE_VITE_CONFIG = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'src': path.resolve(__dirname, './src')
    }
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    }
  }
})`;

const BASE_TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: "ES2022",
    useDefineForClassFields: true,
    lib: ["ES2022", "DOM", "DOM.Iterable"],
    module: "ESNext",
    skipLibCheck: true,
    moduleResolution: "bundler",
    allowImportingTsExtensions: true,
    resolveJsonModule: true,
    isolatedModules: true,
    noEmit: true,
    jsx: "react-jsx",
    strict: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    noFallthroughCasesInSwitch: true,
    baseUrl: ".",
    paths: {
      "@/*": ["src/*"],
      "src/*": ["src/*"]
    }
  },
  include: ["src"]
}, null, 2);

const BASE_INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FluidFlow App</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>`;

const BASE_MAIN_TSX = `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)`;

const BASE_INDEX_CSS = `@import "tailwindcss";`;

// ============================================================================
// DASHBOARD TEMPLATE
// ============================================================================

const DASHBOARD_APP = `import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { StatsGrid } from './components/StatsGrid'
import { RevenueChart } from './components/RevenueChart'
import { RecentActivity } from './components/RecentActivity'

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            <StatsGrid />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <RevenueChart />
              </div>
              <RecentActivity />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}`;

const DASHBOARD_SIDEBAR = `import { LayoutDashboard, Users, ShoppingCart, BarChart3, Settings, LogOut, Boxes } from 'lucide-react'

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: Users, label: 'Customers', active: false },
  { icon: ShoppingCart, label: 'Orders', active: false },
  { icon: Boxes, label: 'Products', active: false },
  { icon: BarChart3, label: 'Analytics', active: false },
  { icon: Settings, label: 'Settings', active: false },
]

export function Sidebar() {
  return (
    <aside className="w-64 bg-slate-900 border-r border-white/5 flex flex-col" data-ff-group="sidebar" data-ff-id="main-sidebar">
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Boxes className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white">Acme</span>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.label}
            className={\`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors \${
              item.active
                ? 'bg-blue-500/10 text-blue-400'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }\`}
            data-ff-group="sidebar"
            data-ff-id={\`nav-\${item.label.toLowerCase()}\`}
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-white/5">
        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors" data-ff-group="sidebar" data-ff-id="logout-btn">
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </aside>
  )
}`;

const DASHBOARD_HEADER = `import { Search, Bell, User } from 'lucide-react'

export function Header() {
  return (
    <header className="h-16 bg-slate-900/50 border-b border-white/5 flex items-center justify-between px-6" data-ff-group="header" data-ff-id="main-header">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search..."
            className="w-64 pl-10 pr-4 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50"
            data-ff-group="header"
            data-ff-id="search-input"
          />
        </div>

        <button className="relative p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors" data-ff-group="header" data-ff-id="notifications-btn">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        <button className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg transition-colors" data-ff-group="header" data-ff-id="user-menu">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
        </button>
      </div>
    </header>
  )
}`;

const DASHBOARD_STATS = `import { TrendingUp, TrendingDown, Users, DollarSign, ShoppingCart, Eye } from 'lucide-react'

const stats = [
  { label: 'Total Revenue', value: '$45,231.89', change: '+20.1%', trend: 'up', icon: DollarSign, color: 'from-green-500 to-emerald-600' },
  { label: 'Active Users', value: '2,350', change: '+15.3%', trend: 'up', icon: Users, color: 'from-blue-500 to-cyan-600' },
  { label: 'Total Orders', value: '1,247', change: '+8.2%', trend: 'up', icon: ShoppingCart, color: 'from-purple-500 to-pink-600' },
  { label: 'Page Views', value: '45.2K', change: '-2.4%', trend: 'down', icon: Eye, color: 'from-orange-500 to-red-600' },
]

export function StatsGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-ff-group="stats" data-ff-id="stats-grid">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-slate-900/50 border border-white/5 rounded-xl p-6 hover:border-white/10 transition-colors"
          data-ff-group="stats"
          data-ff-id={\`stat-\${stat.label.toLowerCase().replace(' ', '-')}\`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className={\`w-12 h-12 rounded-xl bg-gradient-to-br \${stat.color} flex items-center justify-center\`}>
              <stat.icon className="w-6 h-6 text-white" />
            </div>
            <div className={\`flex items-center gap-1 text-sm \${stat.trend === 'up' ? 'text-green-400' : 'text-red-400'}\`}>
              {stat.trend === 'up' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {stat.change}
            </div>
          </div>
          <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
          <div className="text-sm text-slate-400">{stat.label}</div>
        </div>
      ))}
    </div>
  )
}`;

const DASHBOARD_CHART = `import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const data = [
  { name: 'Jan', revenue: 4000 },
  { name: 'Feb', revenue: 3000 },
  { name: 'Mar', revenue: 5000 },
  { name: 'Apr', revenue: 4500 },
  { name: 'May', revenue: 6000 },
  { name: 'Jun', revenue: 5500 },
  { name: 'Jul', revenue: 7000 },
]

export function RevenueChart() {
  return (
    <div className="bg-slate-900/50 border border-white/5 rounded-xl p-6" data-ff-group="chart" data-ff-id="revenue-chart">
      <h3 className="text-lg font-semibold text-white mb-6">Revenue Overview</h3>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
              labelStyle={{ color: '#fff' }}
            />
            <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} dot={{ fill: '#3b82f6', strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}`;

const DASHBOARD_ACTIVITY = `import { ShoppingCart, User, CreditCard, Package } from 'lucide-react'

const activities = [
  { icon: ShoppingCart, text: 'New order #1234', time: '2 min ago', color: 'text-blue-400 bg-blue-500/20' },
  { icon: User, text: 'New customer registered', time: '15 min ago', color: 'text-green-400 bg-green-500/20' },
  { icon: CreditCard, text: 'Payment received', time: '1 hour ago', color: 'text-purple-400 bg-purple-500/20' },
  { icon: Package, text: 'Order #1230 shipped', time: '2 hours ago', color: 'text-orange-400 bg-orange-500/20' },
  { icon: User, text: 'New customer registered', time: '3 hours ago', color: 'text-green-400 bg-green-500/20' },
]

export function RecentActivity() {
  return (
    <div className="bg-slate-900/50 border border-white/5 rounded-xl p-6" data-ff-group="activity" data-ff-id="recent-activity">
      <h3 className="text-lg font-semibold text-white mb-6">Recent Activity</h3>
      <div className="space-y-4">
        {activities.map((activity, i) => (
          <div key={i} className="flex items-center gap-4" data-ff-group="activity" data-ff-id={\`activity-\${i}\`}>
            <div className={\`w-10 h-10 rounded-lg \${activity.color} flex items-center justify-center\`}>
              <activity.icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{activity.text}</p>
              <p className="text-xs text-slate-500">{activity.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}`;

// ============================================================================
// LANDING PAGE TEMPLATE
// ============================================================================

const LANDING_APP = `import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { Features } from './components/Features'
import { Pricing } from './components/Pricing'
import { Footer } from './components/Footer'

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Header />
      <main>
        <Hero />
        <Features />
        <Pricing />
      </main>
      <Footer />
    </div>
  )
}`;

const LANDING_HEADER = `import { Sparkles, Menu, X } from 'lucide-react'
import { useState } from 'react'

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
]

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-lg border-b border-white/5" data-ff-group="header" data-ff-id="main-header">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold text-white">FluidFlow</span>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm text-slate-400 hover:text-white transition-colors"
              data-ff-group="header"
              data-ff-id={\`nav-\${link.label.toLowerCase()}\`}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-4">
          <button className="text-sm text-slate-400 hover:text-white transition-colors" data-ff-group="header" data-ff-id="login-btn">
            Log in
          </button>
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors" data-ff-group="header" data-ff-id="signup-btn">
            Get Started
          </button>
        </div>

        <button
          className="md:hidden p-2 text-slate-400 hover:text-white"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          data-ff-group="header"
          data-ff-id="mobile-menu-btn"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden bg-slate-900 border-t border-white/5 p-4 space-y-4">
          {navLinks.map((link) => (
            <a key={link.label} href={link.href} className="block text-slate-400 hover:text-white py-2">
              {link.label}
            </a>
          ))}
          <div className="pt-4 border-t border-white/10 space-y-2">
            <button className="w-full py-2 text-slate-400 hover:text-white">Log in</button>
            <button className="w-full py-2 bg-blue-600 text-white rounded-lg">Get Started</button>
          </div>
        </div>
      )}
    </header>
  )
}`;

const LANDING_HERO = `import { ArrowRight, Play } from 'lucide-react'

export function Hero() {
  return (
    <section className="pt-32 pb-20 px-6" data-ff-group="hero" data-ff-id="hero-section">
      <div className="max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-sm text-blue-400 mb-8" data-ff-group="hero" data-ff-id="hero-badge">
          <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
          Now in Public Beta
        </div>

        <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
          Build faster with
          <span className="bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text"> FluidFlow</span>
        </h1>

        <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10">
          The modern platform for building beautiful, responsive applications.
          Ship faster with our intuitive tools and AI-powered assistance.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button className="flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors" data-ff-group="hero" data-ff-id="cta-primary">
            Start Building Free
            <ArrowRight className="w-5 h-5" />
          </button>
          <button className="flex items-center gap-2 px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-medium rounded-xl border border-white/10 transition-colors" data-ff-group="hero" data-ff-id="cta-secondary">
            <Play className="w-5 h-5" />
            Watch Demo
          </button>
        </div>

        <div className="mt-20 relative">
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent z-10" />
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl border border-white/10 p-2 shadow-2xl">
            <div className="bg-slate-950 rounded-xl h-96 flex items-center justify-center">
              <span className="text-slate-600">App Preview</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}`;

const LANDING_FEATURES = `import { Zap, Shield, Palette, Code, Cloud, Users } from 'lucide-react'

const features = [
  { icon: Zap, title: 'Lightning Fast', description: 'Optimized for speed with instant hot reload and blazing fast builds.' },
  { icon: Shield, title: 'Secure by Default', description: 'Enterprise-grade security with automatic vulnerability scanning.' },
  { icon: Palette, title: 'Beautiful UI', description: 'Pre-built components that look stunning out of the box.' },
  { icon: Code, title: 'Developer First', description: 'Built by developers, for developers. TypeScript native.' },
  { icon: Cloud, title: 'Cloud Native', description: 'Deploy anywhere with one-click integrations.' },
  { icon: Users, title: 'Team Collaboration', description: 'Real-time collaboration with your entire team.' },
]

export function Features() {
  return (
    <section id="features" className="py-20 px-6" data-ff-group="features" data-ff-id="features-section">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Everything you need</h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Powerful features to help you build, deploy, and scale your applications.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="p-6 bg-slate-900/50 border border-white/5 rounded-2xl hover:border-white/10 transition-all group"
              data-ff-group="features"
              data-ff-id={\`feature-\${feature.title.toLowerCase().replace(' ', '-')}\`}
            >
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
                <feature.icon className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-slate-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}`;

const LANDING_PRICING = `import { Check } from 'lucide-react'

const plans = [
  {
    name: 'Starter',
    price: '$0',
    description: 'Perfect for side projects',
    features: ['Up to 3 projects', 'Basic analytics', 'Community support', '1GB storage'],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$29',
    description: 'For professional developers',
    features: ['Unlimited projects', 'Advanced analytics', 'Priority support', '100GB storage', 'Custom domains', 'Team collaboration'],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'For large organizations',
    features: ['Everything in Pro', 'Dedicated support', 'Custom integrations', 'SLA guarantee', 'On-premise option'],
    cta: 'Contact Sales',
    highlighted: false,
  },
]

export function Pricing() {
  return (
    <section id="pricing" className="py-20 px-6 bg-slate-900/50" data-ff-group="pricing" data-ff-id="pricing-section">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Simple, transparent pricing</h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Choose the plan that works best for you and your team.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={\`p-8 rounded-2xl border transition-all \${
                plan.highlighted
                  ? 'bg-gradient-to-b from-blue-500/10 to-purple-500/10 border-blue-500/30 scale-105'
                  : 'bg-slate-900/50 border-white/5 hover:border-white/10'
              }\`}
              data-ff-group="pricing"
              data-ff-id={\`plan-\${plan.name.toLowerCase()}\`}
            >
              {plan.highlighted && (
                <div className="text-xs font-medium text-blue-400 mb-4 uppercase tracking-wide">Most Popular</div>
              )}
              <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-bold text-white">{plan.price}</span>
                {plan.price !== 'Custom' && <span className="text-slate-400">/month</span>}
              </div>
              <p className="text-slate-400 mb-6">{plan.description}</p>

              <button
                className={\`w-full py-3 rounded-lg font-medium transition-colors mb-8 \${
                  plan.highlighted
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-white/5 hover:bg-white/10 text-white border border-white/10'
                }\`}
              >
                {plan.cta}
              </button>

              <ul className="space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm text-slate-300">
                    <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}`;

const LANDING_FOOTER = `import { Sparkles, Twitter, Github, Linkedin } from 'lucide-react'

const footerLinks = {
  Product: ['Features', 'Pricing', 'Changelog', 'Roadmap'],
  Company: ['About', 'Blog', 'Careers', 'Press'],
  Resources: ['Documentation', 'Help Center', 'Community', 'Status'],
  Legal: ['Privacy', 'Terms', 'Security', 'Cookies'],
}

export function Footer() {
  return (
    <footer className="bg-slate-900 border-t border-white/5 py-16 px-6" data-ff-group="footer" data-ff-id="main-footer">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-bold text-white">FluidFlow</span>
            </div>
            <p className="text-slate-400 text-sm mb-4">
              Build beautiful applications faster than ever before.
            </p>
            <div className="flex items-center gap-4">
              <a href="#" className="text-slate-400 hover:text-white transition-colors">
                <Twitter className="w-5 h-5" />
              </a>
              <a href="#" className="text-slate-400 hover:text-white transition-colors">
                <Github className="w-5 h-5" />
              </a>
              <a href="#" className="text-slate-400 hover:text-white transition-colors">
                <Linkedin className="w-5 h-5" />
              </a>
            </div>
          </div>

          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-sm font-semibold text-white mb-4">{title}</h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-white/5 text-center text-sm text-slate-500">
          &copy; {new Date().getFullYear()} FluidFlow. All rights reserved.
        </div>
      </div>
    </footer>
  )
}`;

// ============================================================================
// FORM TEMPLATE
// ============================================================================

const FORM_APP = `import { FormWizard } from './components/FormWizard'

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Create Account</h1>
          <p className="text-slate-400">Fill in your details to get started</p>
        </div>
        <FormWizard />
      </div>
    </div>
  )
}`;

const FORM_WIZARD = `import { useState } from 'react'
import { User, Mail, Lock, Building, Check, ChevronRight, ChevronLeft } from 'lucide-react'

interface FormData {
  firstName: string
  lastName: string
  email: string
  password: string
  company: string
  role: string
  agreeTerms: boolean
}

const steps = ['Personal', 'Account', 'Company']

export function FormWizard() {
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    company: '',
    role: '',
    agreeTerms: false,
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})

  const updateField = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  const validateStep = () => {
    const newErrors: Partial<Record<keyof FormData, string>> = {}

    if (currentStep === 0) {
      if (!formData.firstName.trim()) newErrors.firstName = 'First name is required'
      if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required'
    } else if (currentStep === 1) {
      if (!formData.email.trim()) newErrors.email = 'Email is required'
      else if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(formData.email)) newErrors.email = 'Invalid email'
      if (!formData.password) newErrors.password = 'Password is required'
      else if (formData.password.length < 8) newErrors.password = 'Min 8 characters'
    } else if (currentStep === 2) {
      if (!formData.company.trim()) newErrors.company = 'Company is required'
      if (!formData.agreeTerms) newErrors.agreeTerms = 'You must agree to terms'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateStep()) {
      if (currentStep < steps.length - 1) {
        setCurrentStep(prev => prev + 1)
      } else {
        alert('Form submitted! Check console for data.')
        console.log('Form data:', formData)
      }
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  return (
    <div className="bg-slate-800/50 border border-white/10 rounded-2xl p-8" data-ff-group="form" data-ff-id="form-wizard">
      {/* Progress Steps */}
      <div className="flex items-center justify-between mb-8">
        {steps.map((step, i) => (
          <div key={step} className="flex items-center">
            <div className={\`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors \${
              i < currentStep
                ? 'bg-green-500 border-green-500 text-white'
                : i === currentStep
                ? 'border-blue-500 text-blue-400'
                : 'border-white/20 text-slate-500'
            }\`}>
              {i < currentStep ? <Check className="w-5 h-5" /> : i + 1}
            </div>
            <span className={\`ml-2 text-sm font-medium \${i <= currentStep ? 'text-white' : 'text-slate-500'}\`}>
              {step}
            </span>
            {i < steps.length - 1 && (
              <div className={\`w-12 h-0.5 mx-4 \${i < currentStep ? 'bg-green-500' : 'bg-white/10'}\`} />
            )}
          </div>
        ))}
      </div>

      {/* Form Steps */}
      <div className="space-y-6">
        {currentStep === 0 && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">First Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => updateField('firstName', e.target.value)}
                    className={\`w-full pl-10 pr-4 py-3 bg-slate-900/50 border rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 \${errors.firstName ? 'border-red-500' : 'border-white/10'}\`}
                    placeholder="John"
                    data-ff-group="form" data-ff-id="firstName"
                  />
                </div>
                {errors.firstName && <p className="text-red-400 text-xs mt-1">{errors.firstName}</p>}
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Last Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => updateField('lastName', e.target.value)}
                    className={\`w-full pl-10 pr-4 py-3 bg-slate-900/50 border rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 \${errors.lastName ? 'border-red-500' : 'border-white/10'}\`}
                    placeholder="Doe"
                    data-ff-group="form" data-ff-id="lastName"
                  />
                </div>
                {errors.lastName && <p className="text-red-400 text-xs mt-1">{errors.lastName}</p>}
              </div>
            </div>
          </>
        )}

        {currentStep === 1 && (
          <>
            <div>
              <label className="block text-sm text-slate-400 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  className={\`w-full pl-10 pr-4 py-3 bg-slate-900/50 border rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 \${errors.email ? 'border-red-500' : 'border-white/10'}\`}
                  placeholder="john@example.com"
                  data-ff-group="form" data-ff-id="email"
                />
              </div>
              {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  className={\`w-full pl-10 pr-4 py-3 bg-slate-900/50 border rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 \${errors.password ? 'border-red-500' : 'border-white/10'}\`}
                  placeholder="Min. 8 characters"
                  data-ff-group="form" data-ff-id="password"
                />
              </div>
              {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
            </div>
          </>
        )}

        {currentStep === 2 && (
          <>
            <div>
              <label className="block text-sm text-slate-400 mb-2">Company</label>
              <div className="relative">
                <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => updateField('company', e.target.value)}
                  className={\`w-full pl-10 pr-4 py-3 bg-slate-900/50 border rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 \${errors.company ? 'border-red-500' : 'border-white/10'}\`}
                  placeholder="Acme Inc."
                  data-ff-group="form" data-ff-id="company"
                />
              </div>
              {errors.company && <p className="text-red-400 text-xs mt-1">{errors.company}</p>}
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2">Role</label>
              <select
                value={formData.role}
                onChange={(e) => updateField('role', e.target.value)}
                className="w-full px-4 py-3 bg-slate-900/50 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-500"
                data-ff-group="form" data-ff-id="role"
              >
                <option value="">Select your role</option>
                <option value="developer">Developer</option>
                <option value="designer">Designer</option>
                <option value="manager">Manager</option>
                <option value="other">Other</option>
              </select>
            </div>
            <label className={\`flex items-center gap-3 p-4 bg-slate-900/30 rounded-lg border cursor-pointer \${errors.agreeTerms ? 'border-red-500' : 'border-white/5'}\`}>
              <input
                type="checkbox"
                checked={formData.agreeTerms}
                onChange={(e) => updateField('agreeTerms', e.target.checked)}
                className="w-5 h-5 rounded border-white/20 bg-slate-900 text-blue-500 focus:ring-blue-500"
                data-ff-group="form" data-ff-id="agreeTerms"
              />
              <span className="text-sm text-slate-300">
                I agree to the <a href="#" className="text-blue-400 hover:underline">Terms of Service</a> and{' '}
                <a href="#" className="text-blue-400 hover:underline">Privacy Policy</a>
              </span>
            </label>
            {errors.agreeTerms && <p className="text-red-400 text-xs">{errors.agreeTerms}</p>}
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-8 pt-6 border-t border-white/5">
        <button
          onClick={handleBack}
          disabled={currentStep === 0}
          className="flex items-center gap-2 px-6 py-3 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          data-ff-group="form" data-ff-id="back-btn"
        >
          <ChevronLeft className="w-5 h-5" />
          Back
        </button>
        <button
          onClick={handleNext}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
          data-ff-group="form" data-ff-id="next-btn"
        >
          {currentStep === steps.length - 1 ? 'Submit' : 'Continue'}
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}`;

// ============================================================================
// EXPORT TEMPLATES
// ============================================================================

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'dashboard',
    name: 'Analytics Dashboard',
    description: 'Admin dashboard with stats, charts, and activity feed',
    category: 'dashboard',
    icon: 'LayoutDashboard',
    previewColor: 'from-blue-500 to-cyan-500',
    features: ['Stats cards', 'Revenue chart', 'Activity feed', 'Sidebar navigation', 'Search & notifications'],
    files: {
      'package.json': BASE_PACKAGE_JSON,
      'vite.config.ts': BASE_VITE_CONFIG,
      'tsconfig.json': BASE_TSCONFIG,
      'index.html': BASE_INDEX_HTML,
      'src/main.tsx': BASE_MAIN_TSX,
      'src/index.css': BASE_INDEX_CSS,
      'src/App.tsx': DASHBOARD_APP,
      'src/components/Sidebar.tsx': DASHBOARD_SIDEBAR,
      'src/components/Header.tsx': DASHBOARD_HEADER,
      'src/components/StatsGrid.tsx': DASHBOARD_STATS,
      'src/components/RevenueChart.tsx': DASHBOARD_CHART,
      'src/components/RecentActivity.tsx': DASHBOARD_ACTIVITY,
    },
  },
  {
    id: 'landing',
    name: 'SaaS Landing Page',
    description: 'Modern landing page with hero, features, and pricing',
    category: 'landing',
    icon: 'Rocket',
    previewColor: 'from-purple-500 to-pink-500',
    features: ['Hero section', 'Features grid', 'Pricing cards', 'Responsive nav', 'Footer with links'],
    files: {
      'package.json': BASE_PACKAGE_JSON,
      'vite.config.ts': BASE_VITE_CONFIG,
      'tsconfig.json': BASE_TSCONFIG,
      'index.html': BASE_INDEX_HTML,
      'src/main.tsx': BASE_MAIN_TSX,
      'src/index.css': BASE_INDEX_CSS,
      'src/App.tsx': LANDING_APP,
      'src/components/Header.tsx': LANDING_HEADER,
      'src/components/Hero.tsx': LANDING_HERO,
      'src/components/Features.tsx': LANDING_FEATURES,
      'src/components/Pricing.tsx': LANDING_PRICING,
      'src/components/Footer.tsx': LANDING_FOOTER,
    },
  },
  {
    id: 'form',
    name: 'Multi-Step Form',
    description: 'Registration wizard with validation and progress',
    category: 'form',
    icon: 'ClipboardList',
    previewColor: 'from-green-500 to-emerald-500',
    features: ['Step progress', 'Form validation', 'Input icons', 'Error states', 'Terms checkbox'],
    files: {
      'package.json': BASE_PACKAGE_JSON,
      'vite.config.ts': BASE_VITE_CONFIG,
      'tsconfig.json': BASE_TSCONFIG,
      'index.html': BASE_INDEX_HTML,
      'src/main.tsx': BASE_MAIN_TSX,
      'src/index.css': BASE_INDEX_CSS,
      'src/App.tsx': FORM_APP,
      'src/components/FormWizard.tsx': FORM_WIZARD,
    },
  },
];

// Helper to get template by ID
export function getProjectTemplateById(id: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find(t => t.id === id);
}

// Helper to get templates by category
export function getProjectTemplatesByCategory(category: ProjectTemplate['category']): ProjectTemplate[] {
  return PROJECT_TEMPLATES.filter(t => t.category === category);
}
