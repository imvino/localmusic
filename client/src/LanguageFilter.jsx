import { useState, useRef, useEffect } from 'react'
import { Globe, X, ChevronDown } from 'lucide-react'

const LANGUAGES = [
  { code: 'tamil', name: 'Tamil' },
  { code: 'hindi', name: 'Hindi' },
  { code: 'telugu', name: 'Telugu' },
  { code: 'malayalam', name: 'Malayalam' },
  { code: 'kannada', name: 'Kannada' },
  { code: 'bengali', name: 'Bengali' },
  { code: 'punjabi', name: 'Punjabi' },
  { code: 'english', name: 'English' },
]

export default function LanguageFilter({ selectedLanguages, onLanguageChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleLanguage = (langCode) => {
    if (langCode === 'all') {
      onLanguageChange([])
      return
    }

    const newSelected = selectedLanguages.includes(langCode)
      ? selectedLanguages.filter(code => code !== langCode)
      : [...selectedLanguages, langCode]
    onLanguageChange(newSelected)
  }

  const clearAll = () => {
    onLanguageChange([])
  }

  const getDisplayText = () => {
    if (selectedLanguages.length === 0) return 'All Languages'
    if (selectedLanguages.length === 1) {
      const lang = LANGUAGES.find(l => l.code === selectedLanguages[0])
      return lang?.name || 'All Languages'
    }
    return `${selectedLanguages.length} Languages`
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-md text-sm font-medium transition-colors border border-zinc-700"
      >
        <Globe size={14} className="text-zinc-400" />
        <span>{getDisplayText()}</span>
        <ChevronDown size={14} className="text-zinc-400" />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50 p-3">
          {/* Clear All Button */}
          {selectedLanguages.length > 0 && (
            <button
              onClick={clearAll}
              className="w-full text-left px-3 py-2 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors mb-2"
            >
              Clear All
            </button>
          )}

          {/* Language Options */}
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {/* All Languages Option */}
            <label className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-800 rounded-md cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={selectedLanguages.length === 0}
                onChange={() => toggleLanguage('all')}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-[#fc3c44] focus:ring-[#fc3c44] focus:ring-offset-0 focus:ring-offset-zinc-900"
              />
              <span className="text-sm text-white">All Languages</span>
            </label>

            {LANGUAGES.map(lang => (
              <label
                key={lang.code}
                className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-800 rounded-md cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedLanguages.includes(lang.code)}
                  onChange={() => toggleLanguage(lang.code)}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-[#fc3c44] focus:ring-[#fc3c44] focus:ring-offset-0 focus:ring-offset-zinc-900"
                />
                <span className="text-sm text-white">{lang.name}</span>
              </label>
            ))}
          </div>

          {/* Selected Tags */}
          {selectedLanguages.length > 0 && (
            <div className="mt-3 pt-3 border-t border-zinc-800 flex flex-wrap gap-2">
              {selectedLanguages.map(code => {
                const lang = LANGUAGES.find(l => l.code === code)
                return (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-800 text-zinc-300 text-xs rounded-md"
                  >
                    {lang?.name || code}
                    <button
                      onClick={() => toggleLanguage(code)}
                      className="hover:text-white transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
