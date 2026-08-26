-- 010_index_foreign_keys.sql
--
-- Indeksy na kolumnach kluczy obcych.
--
-- PostgreSQL zaklada indeks automatycznie dla PRIMARY KEY i UNIQUE, ale NIE dla
-- kolumn wskazujacych kluczem obcym. Do 2026-08-25 schemat nie mial ani jednego
-- indeksu zalozonego jawnie, przez co piec z szesciu kluczy obcych bylo
-- nieindeksowanych. Skutki byly dwojakie.
--
-- 1. NA SCIEZCE MIERZONYCH SCENARIUSZY
--
--    cart_items.product_id — podzapytanie o dostepny stan magazynowy
--    (getAvailableStock, identyczne w obu implementacjach) wykonuje
--        SELECT SUM(ci.quantity) FROM cart_items ci
--         WHERE ci.product_id = p.id AND ci.expires_at > NOW() AND ci.user_id <> $2
--    przy KAZDYM zadaniu S5. Bez indeksu jest to skan sekwencyjny tabeli, ktora
--    w trakcie przebiegu narasta — czas obslugi rosl wiec monotonicznie w obrebie
--    jednego pomiaru.
--
--    products.category_id — filtrowanie listy produktow po kategorii w S3.
--
-- 2. NA SCIEZCE PRZYWRACANIA STANU MIEDZY PRZEBIEGAMI
--
--    order_items.order_id — kaskadowe usuniecie zamowienia wymagalo skanu
--    sekwencyjnego calej tabeli order_items DLA KAZDEGO usuwanego zamowienia.
--    Przy 7,5 mln zamowien i 8,2 mln pozycji czyscienie bazy nie moglo sie
--    zakonczyc w rozsadnym czasie (przerwane po 13 minutach bez postepu).
--
--    orders.user_id — klucz obcy bez ON DELETE, wiec usuniecie uzytkownika
--    wymaga sprawdzenia, czy nie ma zamowien; bez indeksu to skan sekwencyjny
--    tabeli orders dla kazdego z ~2800 uzytkownikow usuwanych przy resecie.
--
-- WPLYW NA POROWNANIE: zaden. Obie implementacje korzystaja z tego samego
-- schematu i wykonuja identyczne zapytania, wiec indeksy dzialaja na nie tak
-- samo. Zmieniaja natomiast proporcje miedzy czasem spedzanym w bazie a czasem
-- spedzanym w kodzie aplikacji — i w te strone, ktora czyni pomiar
-- BARDZIEJ miarodajnym, bo kazde realne wdrozenie te indeksy posiada.
-- Fakt dodania indeksow nalezy odnotowac w metodyce (rozdz. 9).

CREATE INDEX IF NOT EXISTS idx_order_items_order_id   ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id         ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id  ON cart_items (product_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id   ON products (category_id);
