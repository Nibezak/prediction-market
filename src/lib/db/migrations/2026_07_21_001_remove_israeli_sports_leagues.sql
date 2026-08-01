DELETE FROM sports_menu_items
WHERE lower(coalesce(menu_slug, '')) = 'bkisrsl'
   OR lower(coalesce(label, '')) LIKE '%israel%'
   OR lower(coalesce(label, '')) LIKE '%israeli%'
   OR lower(coalesce(href, '')) LIKE '%/sports/bkisrsl/%';
