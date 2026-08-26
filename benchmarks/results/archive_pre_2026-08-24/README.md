# Pomiary sprzed serii z 2026-08-24

Wyniki z wczesniejszych sesji benchmarkowych (znaczniki `1778…`, `1780…`,
maj 2026). Pochodza z innego stanu kodu i obejmuja tylko profil A oraz
pojedynczy przebieg s1/B.

Odlozone tutaj, bo `compare.py` grupuje pliki przez `iterdir()` po samej nazwie
i doliczylby je jako dodatkowe powtorzenia profilu A we wszystkich szesciu
scenariuszach — zafalszowujac srednie, odchylenia standardowe i przedzialy
ufnosci serii z 2026-08-24/25. Podkatalog jest dla `iterdir()` niewidoczny,
bo jego nazwa nie pasuje do zadnego z wzorcow K6_RE / STAT_RE / DIAG_RE.

Nie sa to pomiary bledne — po prostu nie naleza do tej serii.
