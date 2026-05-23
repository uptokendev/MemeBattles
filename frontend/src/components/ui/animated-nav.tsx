"use client"

import { useNavigate, useLocation } from "react-router-dom"
import { LucideIcon } from "lucide-react"

interface NavOption {
  icon: LucideIcon | string
  label: string
  path: string
}

interface AnimatedNavProps {
  options: NavOption[]
  onNavigate?: () => void
}

export default function AnimatedNav({ options, onNavigate }: AnimatedNavProps) {
  const navigate = useNavigate()
  const location = useLocation()

  const matchesPath = (target: string) => {
    if (/^https?:\/\//i.test(target)) return false

    try {
      const url = new URL(target, "https://memewarzone.local")
      if (url.pathname !== location.pathname) return false

      const currentSearch = new URLSearchParams(location.search)
      for (const [key, value] of url.searchParams.entries()) {
        if (currentSearch.get(key) !== value) return false
      }

      return true
    } catch {
      return location.pathname === target
    }
  }

  const handleChange = (path: string) => {
    if (/^https?:\/\//i.test(path)) {
      window.open(path, "_blank", "noopener,noreferrer")
      onNavigate?.()
      return
    }
    navigate(path)
    onNavigate?.()
  }

  const makeId = (label: string) =>
    `nav-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`

  const getGliderTransform = () => {
    const index = options.findIndex((option) => matchesPath(option.path))
    return `translateY(${index * 100}%)`
  }

  const isPageInMenu = options.some((option) => matchesPath(option.path))

  return (
    <div className="relative flex w-full flex-col pl-3">
      {options.map((option) => (
        <div key={option.path} className="relative z-20 py-0.5 [-webkit-tap-highlight-color:transparent]">
          <input
            id={makeId(option.label)}
            name="navigation"
            type="radio"
            value={option.path}
            checked={matchesPath(option.path)}
            onChange={(e) => handleChange(e.target.value)}
            className="absolute z-30 m-0 h-full w-full cursor-pointer appearance-none opacity-0 ring-0 [-webkit-tap-highlight-color:transparent] focus:outline-none focus:ring-0 focus-visible:outline-none active:outline-none accent-[hsl(var(--accent))]"
          />
          <label
            htmlFor={makeId(option.label)}
            className={`block cursor-pointer px-3.5 py-2.5 text-sm transition-all duration-300 ease-in-out outline-none [-webkit-tap-highlight-color:transparent] focus:outline-none focus-visible:outline-none ${
              matchesPath(option.path)
                ? "font-medium text-accent"
                : "text-sidebar-foreground hover:text-accent"
            }`}
          >
            <span className="flex items-center gap-2.5">
              {typeof option.icon === "string" ? (
                <img
                  src={option.icon}
                  alt={option.label}
                  className={`h-[18px] w-[18px] transition-all duration-300 ${
                    matchesPath(option.path)
                      ? "[filter:brightness(0)_saturate(100%)_invert(50%)_sepia(88%)_saturate(1567%)_hue-rotate(355deg)_brightness(101%)_contrast(92%)]"
                      : "opacity-70"
                  }`}
                />
              ) : (
                <option.icon className="h-[18px] w-[18px]" />
              )}
              <span>{option.label}</span>
            </span>
          </label>
        </div>
      ))}

      <div className="pointer-events-none absolute bottom-0 left-0 top-0 w-px bg-gradient-to-b from-transparent via-border to-transparent">
        <div
          className={`relative w-full bg-gradient-to-b from-transparent via-accent to-transparent transition-all duration-[650ms] ease-[cubic-bezier(0.68,-0.55,0.265,1.55)] ${
            isPageInMenu ? "opacity-100" : "opacity-0"
          }`}
          style={{
            height: `${100 / options.length}%`,
            transform: getGliderTransform(),
          }}
        />
      </div>
    </div>
  )
}
