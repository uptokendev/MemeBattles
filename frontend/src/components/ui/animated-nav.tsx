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
}

export default function AnimatedNav({ options }: AnimatedNavProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const selectedValue = location.pathname

  const handleChange = (path: string) => {
    if (/^https?:\/\//i.test(path)) {
      window.open(path, "_blank", "noopener,noreferrer")
      return
    }
    navigate(path)
  }

  const makeId = (label: string) =>
    `nav-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`

  const getGliderTransform = () => {
    const index = options.findIndex((option) => option.path === selectedValue)
    return `translateY(${index * 100}%)`
  }

  const getGliderHeightClass = () => {
    // Calculate the height class based on number of options (h-1/3, h-1/4, h-1/5)
    return `h-1/${options.length}`
  }

  const isPageInMenu = options.some((option) => option.path === selectedValue)

  return (
    <div className="relative flex flex-col pl-3 w-full">
      {options.map((option) => (
        <div key={option.path} className="relative z-20 py-1 [-webkit-tap-highlight-color:transparent]">
          <input
            id={makeId(option.label)}
            name="navigation"
            type="radio"
            value={option.path}
            checked={selectedValue === option.path}
            onChange={(e) => handleChange(e.target.value)}
            className="absolute w-full h-full m-0 opacity-0 cursor-pointer z-30 appearance-none focus:outline-none focus:ring-0 focus-visible:outline-none ring-0 active:outline-none [-webkit-tap-highlight-color:transparent] accent-[hsl(var(--accent))]"
          />
          <label
            htmlFor={makeId(option.label)}
            className={`cursor-pointer flex items-center gap-3 text-base py-3 px-4 block transition-all duration-300 ease-in-out outline-none focus:outline-none focus-visible:outline-none [-webkit-tap-highlight-color:transparent] ${
              selectedValue === option.path
                ? "text-accent font-medium"
                : "text-sidebar-foreground hover:text-accent"
            }`}
          >
            {typeof option.icon === 'string' ? (
              <img 
                src={option.icon} 
                alt={option.label} 
                className={`w-5 h-5 transition-all duration-300 ${
                  selectedValue === option.path
                    ? "[filter:brightness(0)_saturate(100%)_invert(88%)_sepia(89%)_saturate(2686%)_hue-rotate(16deg)_brightness(104%)_contrast(104%)]"
                    : "opacity-70"
                }`}
              />
            ) : (
              <option.icon className="w-5 h-5" />
            )}
            <span>{option.label}</span>
          </label>
        </div>
      ))}

      <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-border to-transparent pointer-events-none">
        <div
          className={`relative w-full bg-gradient-to-b from-transparent via-accent to-transparent transition-all duration-[650ms] ease-[cubic-bezier(0.68,-0.55,0.265,1.55)] ${
            isPageInMenu ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ 
            height: `${100 / options.length}%`,
            transform: getGliderTransform()
          }}
        />
      </div>
    </div>
  )
}
