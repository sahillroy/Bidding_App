-- ===========================================================================
-- Demo seed data
--
-- Runs automatically after migrations on `supabase db reset`. Produces a site
-- that looks alive immediately: categories, six sellers, and forty live
-- auctions at varied prices with staggered end times.
--
-- EVERYTHING HERE IS SYNTHETIC. No real person, no real item, no real
-- document number, no real money. Emails are @example.test, which RFC 6761
-- reserves precisely so it can never resolve to a real mailbox.
--
-- Idempotent: safe to run twice. Every insert is guarded.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
insert into public.categories (id, slug, name, parent_id, sort_order) values
  ('11111111-1111-4111-8111-000000000001', 'electronics',   'Electronics',        null, 1),
  ('11111111-1111-4111-8111-000000000002', 'collectibles',  'Collectibles',       null, 2),
  ('11111111-1111-4111-8111-000000000003', 'home-garden',   'Home & Garden',      null, 3),
  ('11111111-1111-4111-8111-000000000004', 'fashion',       'Fashion',            null, 4),
  ('11111111-1111-4111-8111-000000000005', 'books-media',   'Books & Media',      null, 5),
  ('11111111-1111-4111-8111-000000000006', 'sports',        'Sports & Outdoors',  null, 6),
  ('11111111-1111-4111-8111-000000000007', 'musical',       'Musical Instruments',null, 7),
  ('11111111-1111-4111-8111-000000000008', 'vehicles',      'Vehicles & Parts',   null, 8)
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- Demo sellers
--
-- Inserted straight into auth.users, which fires the on_auth_user_created
-- trigger from migration 0002 and creates each profile with a generated handle.
-- Seeding profiles directly would bypass the trigger and hide a bug in it.
--
-- The password hash below is bcrypt of 'demo-password-not-secret'. It is a
-- throwaway for a local stack, is identical on every machine, and unlocks
-- nothing anywhere else.
-- ---------------------------------------------------------------------------
do $$
declare
  v_emails text[] := array[
    'seller-anaya@example.test',
    'seller-vikram@example.test',
    'seller-meera@example.test',
    'seller-rohan@example.test',
    'seller-farah@example.test',
    'seller-dev@example.test'
  ];
  v_email  text;
  v_id     uuid;
  v_n      integer := 0;
begin
  foreach v_email in array v_emails loop
    v_n := v_n + 1;
    v_id := ('22222222-2222-4222-8222-' || lpad(v_n::text, 12, '0'))::uuid;

    if not exists (select 1 from auth.users where id = v_id) then
      insert into auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) values (
        '00000000-0000-0000-0000-000000000000',
        v_id,
        'authenticated',
        'authenticated',
        v_email,
        crypt('demo-password-not-secret', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{}'::jsonb,
        now() - (v_n || ' days')::interval,
        now()
      );
    end if;
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- One admin, so the moderation queue in Phase 3 is reachable immediately.
--
-- Sign in as admin@example.test / demo-password-not-secret
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin uuid := '22222222-2222-4222-8222-000000000099';
begin
  if not exists (select 1 from auth.users where id = v_admin) then
    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_admin, 'authenticated', 'authenticated', 'admin@example.test',
      crypt('demo-password-not-secret', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Demo Admin"}'::jsonb,
      now() - interval '30 days', now()
    );

    -- The trigger created this row as a normal user; promote it. This is the
    -- only place in the entire project where a role is set outside an admin
    -- action, and it exists because a demo needs a first admin to bootstrap
    -- from. In production this would be a one-off manual grant.
    update public.profiles
       set role = 'admin', display_name = 'Demo Admin'
     where id = v_admin;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- Listings
--
-- Prices are in PAISE. The bid_increment on each row is the §6.2 band value
-- for its starting price, computed here rather than hard-coded so the seed
-- cannot drift from the rule.
--
-- current_price is left NULL and bid_count 0: these are auctions nobody has
-- bid on yet. Bidding arrives in Phase 4, and the CHECK constraints in
-- migration 0005 would reject any other combination.
--
-- ends_at is staggered from 40 minutes to 26 days out so the grid shows a
-- realistic spread and the countdowns are visibly different.
-- ---------------------------------------------------------------------------
do $$
declare
  v_rows record;
  v_seller uuid;
  v_increment bigint;
  v_ends timestamptz;
  v_n integer := 0;
begin
  for v_rows in
    select * from (values
      -- title, description, category slug, condition, starting price (paise), hours until end
      ('Canon EOS 200D DSLR with 18-55mm lens', 'Entry-level DSLR in excellent working order. Shutter count under 8,000. Includes the kit lens, original battery, charger and strap. Minor cosmetic marks on the base plate, nothing affecting use. Sensor is clean.', 'electronics', 'good', 2450000, 41),
      ('ThinkPad X1 Carbon Gen 9, 16GB RAM', 'Business ultrabook, i7-1165G7, 16GB soldered RAM, 512GB NVMe. Battery holds roughly 6 hours. Keyboard is in very good condition with no shine on the keys. Ships with the original 65W USB-C charger.', 'electronics', 'good', 5800000, 73),
      ('Sony WH-1000XM4 wireless headphones', 'Noise cancelling over-ear headphones. Earpads replaced three months ago with genuine Sony parts. Includes the hard case, 3.5mm cable and USB-C cable. Pairing and ANC both tested working.', 'electronics', 'like_new', 1450000, 19),
      ('iPad Air 4th gen, 64GB, Wi-Fi', 'Space grey, 64GB. Screen has a factory-applied protector fitted from new and is unmarked underneath. Battery health reported at 91%. Charger included, no original box.', 'electronics', 'good', 2200000, 96),
      ('Raspberry Pi 4 Model B, 8GB kit', 'Complete kit: board, official case with fan, 32GB card preloaded with Raspberry Pi OS, and the official USB-C power supply. Used for a home automation project, powered down cleanly.', 'electronics', 'good', 620000, 30),
      ('Kindle Paperwhite 11th gen, 8GB', 'Backlit e-reader, 6.8 inch display. No scratches on the screen. Includes a fabric cover. Battery lasts weeks on a charge as expected. Factory reset and deregistered.', 'electronics', 'like_new', 780000, 55),
      ('Logitech MX Master 3S mouse', 'Wireless productivity mouse, quiet click version. Includes the USB receiver and charging cable. Scroll wheel and all buttons function correctly. Light wear on the thumb rest.', 'electronics', 'good', 480000, 14),
      ('Dell UltraSharp U2720Q 27-inch 4K monitor', 'Colour-accurate IPS panel, USB-C with 90W power delivery. No dead pixels, no backlight bleed worth mentioning. Original stand and cables included. Ideal for photo or code work.', 'electronics', 'good', 3100000, 140),

      ('1947 India Independence commemorative stamp block', 'Block of four, unused, original gum. Stored flat in an archival sleeve for the last two decades. Light natural toning consistent with age, no tears or thins. Photographed under natural light.', 'collectibles', 'good', 1800000, 200),
      ('Vintage HMV gramophone, working', 'Hand-cranked wind-up gramophone with the original horn. Motor runs and holds speed. Comes with a small quantity of period 78rpm shellac discs. Case shows honest wear.', 'collectibles', 'fair', 4200000, 320),
      ('Set of 12 antique brass door handles', 'Salvaged from a Colonial-era bungalow during renovation. Solid brass, uncleaned so the patina is intact. All screws present. Sold as a set of twelve, matching pattern.', 'collectibles', 'fair', 950000, 88),
      ('1970s Ambassador car bonnet ornament', 'Chrome-plated ornament from a Hindustan Ambassador. Plating is largely intact with some pitting near the base. A genuine period piece rather than a reproduction.', 'collectibles', 'fair', 340000, 48),
      ('First edition Malgudi Days, 1943 printing', 'Early printing with the original dust jacket, which has chips at the head and tail of the spine. Binding is tight and square, pages clean with light foxing to the endpapers.', 'collectibles', 'fair', 2750000, 260),

      ('Teak wood writing desk, restored', 'Solid Burma teak, four drawers with working locks. Restored last year: joints re-glued, surface hand-polished, no veneer anywhere. Measures 120cm by 60cm. Collection only from a ground floor.', 'home-garden', 'good', 1850000, 170),
      ('Cast iron kadai, pre-seasoned', 'Heavy 30cm cast iron kadai, seasoned and ready to cook on. No cracks or warping. Suitable for gas and induction. Weighs a little under 4kg, so shipping is not cheap.', 'home-garden', 'good', 290000, 22),
      ('Handwoven jute floor rug, 6x4 feet', 'Natural undyed jute, flat weave, made in West Bengal. Used in a low-traffic room for around a year. No stains. Reversible and still firm underfoot.', 'home-garden', 'good', 420000, 64),
      ('Brass urli bowl, 14 inch', 'Traditional wide brass bowl for floating flowers and diyas. Hand-beaten finish. Some tarnish which polishes out easily. Sits flat without rocking.', 'home-garden', 'good', 680000, 36),
      ('Set of 6 stoneware dinner plates', 'Wheel-thrown stoneware in a matte charcoal glaze, made by a studio potter in Puducherry. Microwave and dishwasher safe. One plate has a small glaze pinhole on the underside, pictured.', 'home-garden', 'like_new', 540000, 110),
      ('Cane and teak lounge chair', 'Mid-century style chair, teak frame with hand-woven cane back and seat. Cane is intact with no sagging or breaks. Frame is solid, no wobble. Cushion not included.', 'home-garden', 'good', 1250000, 190),

      ('Banarasi silk saree, handloom', 'Pure silk handloom Banarasi with real zari work in a traditional buti pattern. Worn twice, dry cleaned and stored in muslin. No pulls in the zari. Blouse piece attached and unstitched.', 'fashion', 'like_new', 1650000, 82),
      ('Pashmina shawl, hand-embroidered', 'Fine pashmina with sozni hand embroidery along the border. Soft, lightweight and warm. Slight irregularity in the weave near one corner, typical of handwork rather than a fault.', 'fashion', 'good', 2900000, 240),
      ('Kolhapuri leather chappals, size 9', 'Handmade vegetable-tanned leather chappals from Kolhapur. Worn a handful of times, soles barely marked. Leather has begun to soften and take shape.', 'fashion', 'good', 180000, 26),
      ('Vintage Seiko 5 automatic watch', 'Automatic movement, keeps time within roughly 20 seconds a day. Original dial with light patina, replacement steel bracelet. Crystal has fine surface scratches visible at an angle.', 'fashion', 'good', 890000, 130),
      ('Jaipuri block-print cotton quilt', 'Hand block-printed cotton razai, double bed size, filled with cotton. Colours are vegetable dyed and have softened with washing. No tears, no thinning patches.', 'fashion', 'good', 470000, 58),

      ('Complete R.K. Narayan paperback set, 14 books', 'Fourteen novels and short story collections. Reading copies rather than collector copies: spines are creased, pages are clean and unmarked. No missing volumes.', 'books-media', 'good', 380000, 44),
      ('The Argumentative Indian, hardback first', 'Amartya Sen, first hardback edition with dust jacket. Jacket is unclipped and unfaded. Interior is clean with no annotations. A previous owner has signed the front free endpaper.', 'books-media', 'good', 220000, 76),
      ('Vinyl: Ravi Shankar, Three Ragas LP', 'Original pressing, vinyl visually graded VG+ with light surface marks that do not affect play. Sleeve has ring wear and a split of about 3cm along the bottom seam.', 'books-media', 'fair', 640000, 156),
      ('Bound volume of Illustrated Weekly, 1968', 'Twelve monthly issues bound in cloth boards. Paper is tanned but supple, no brittleness. A genuinely interesting record of the period, including the advertising.', 'books-media', 'fair', 310000, 210),

      ('Yonex Astrox 88D Pro badminton racket', 'Strung at 27lbs with BG80. Head-heavy balance, stiff shaft. Small paint chip at 2 o clock on the frame, no cracks. Full cover included.', 'sports', 'good', 950000, 33),
      ('SG Test cricket bat, English willow', 'Grade 2 English willow, knocked in and match ready. Around 15 innings of use. Face has honest ball marks, edges are clean, no cracks. Weight is 1180g.', 'sports', 'good', 1380000, 68),
      ('Decathlon 45L trekking backpack', 'Internal frame, rain cover included, all buckles and zips working. Used on three treks. One small abrasion on the base fabric, not through the material.', 'sports', 'good', 290000, 17),
      ('Cast iron adjustable dumbbell pair, 20kg', 'Two handles plus plates totalling 20kg. Collars grip properly. Surface rust in places which does not affect use. Collection preferred given the weight.', 'sports', 'fair', 410000, 102),
      ('Carbon road bike frameset, 54cm', 'Carbon frame and fork, 54cm, with headset fitted. No cracks — inspected and photographed closely at the usual stress points. Paint has chips at the chainstay and down tube.', 'sports', 'good', 4800000, 280),

      ('Yamaha F310 acoustic guitar', 'Full size dreadnought, spruce top. Neck is straight, action is comfortable, no fret buzz. Fitted with fresh strings. Some pick wear below the soundhole. Gig bag included.', 'musical', 'good', 720000, 25),
      ('Professional tabla set with case', 'Sheesham dayan and steel bayan, both with good syahi in sound condition. Comes with rings, hammer, cushions and a padded case. Recently tuned and playing sweetly.', 'musical', 'good', 1550000, 92),
      ('Harmonium, 3.25 octave, coupler', 'Portable scale-changer harmonium with coupler and three reed banks. Bellows hold air well with no leaks. Two keys have been re-levelled. Tuned to A440.', 'musical', 'good', 2350000, 175),
      ('Roland FP-30 digital piano', '88 weighted keys, hammer action. Includes the sustain pedal and stand. All keys sound evenly, no sticking. Bluetooth MIDI works. Light scuffing on the underside.', 'musical', 'good', 4600000, 148),
      ('Bansuri set, 3 flutes, bamboo', 'Three bamboo flutes in different scales, made by a maker in Pune. Bores are clean and crack-free, bindings tight. Comes in a cloth roll.', 'musical', 'like_new', 340000, 40),

      ('Royal Enfield Classic 350 exhaust, stock', 'Original equipment silencer removed at 4,000km from a 2021 Classic 350. No dents, minimal discolouration, baffles intact. Mounting hardware included.', 'vehicles', 'good', 580000, 60),
      ('Set of 4 alloy wheels, 15 inch, 4x100', 'Four alloys with no kerb damage to three of them; the fourth has a scuff on the lip which is pictured. Tyres not included. Centre caps present.', 'vehicles', 'good', 1420000, 120),
      ('Motorcycle tank bag, magnetic, waterproof', 'Expandable magnetic tank bag with a clear map pocket and a waterproof cover. Magnets are strong and the base is felt-lined so it does not mark paint.', 'vehicles', 'good', 240000, 28)
    ) as t(title, description, cat_slug, condition, starting_price, hours_out)
  loop
    v_n := v_n + 1;

    -- Rotate sellers deterministically.
    v_seller := ('22222222-2222-4222-8222-'
                 || lpad((((v_n - 1) % 6) + 1)::text, 12, '0'))::uuid;

    -- §6.2 price bands. Computed, not hard-coded, so the seed cannot drift.
    v_increment := case
      when v_rows.starting_price >= 50000000 then 500000   -- >= Rs 5,00,000 -> Rs 5,000
      when v_rows.starting_price >= 10000000 then 250000   -- >= Rs 1,00,000 -> Rs 2,500
      when v_rows.starting_price >=  2500000 then 100000   -- >= Rs 25,000   -> Rs 1,000
      when v_rows.starting_price >=   500000 then  25000   -- >= Rs 5,000    -> Rs 250
      when v_rows.starting_price >=    50000 then   5000   -- >= Rs 500      -> Rs 50
      else                                          1000   -- under Rs 500   -> Rs 10
    end;

    v_ends := now() + (v_rows.hours_out || ' hours')::interval;

    if not exists (
      select 1 from public.listings
       where title = v_rows.title and seller_id = v_seller
    ) then
      insert into public.listings (
        seller_id, title, description, category_id, condition,
        starting_price, bid_increment, duration_seconds,
        status, starts_at, ends_at, original_ends_at,
        current_price, highest_bidder_id, bid_count,
        reviewed_by, reviewed_at, created_at
      ) values (
        v_seller,
        v_rows.title,
        v_rows.description,
        (select id from public.categories where slug = v_rows.cat_slug),
        v_rows.condition,
        v_rows.starting_price,
        v_increment,
        v_rows.hours_out * 3600,
        'live',
        now() - interval '2 hours',
        v_ends,
        v_ends,
        null,   -- nobody has bid yet
        null,
        0,
        '22222222-2222-4222-8222-000000000099',
        now() - interval '90 minutes',
        now() - interval '3 hours'
      );
    end if;
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- Phase 3 demo rows: the moderation queue must not be empty after a reset.
--
-- One ordinary pending listing, one with a starting price far outside the
-- category median (the "laptop for 10 crore" case), and one rejected listing
-- so a seller can see a review_note. All synthetic. No images — Storage
-- objects cannot be seeded as files here; the wizard is how real photos
-- arrive. The pending rows are for the admin queue, not for submit_listing.
-- ---------------------------------------------------------------------------
do $$
declare
  v_seller uuid := '22222222-2222-4222-8222-000000000001';
  v_electronics uuid;
begin
  select id into v_electronics from public.categories where slug = 'electronics';

  if not exists (
    select 1 from public.listings
     where title = 'Refurbished inkjet printer, working'
       and seller_id = v_seller
  ) then
    insert into public.listings (
      seller_id, title, description, category_id, condition,
      starting_price, bid_increment, duration_seconds, status
    ) values (
      v_seller,
      'Refurbished inkjet printer, working',
      'Colour inkjet, recently serviced with new print heads. Prints a clean nozzle check. Includes a starter set of aftermarket ink. No original box.',
      v_electronics,
      'good',
      350000,
      25000,
      86400,
      'pending_review'
    );
  end if;

  if not exists (
    select 1 from public.listings
     where title = 'Gaming laptop listed at ten crore'
       and seller_id = v_seller
  ) then
    insert into public.listings (
      seller_id, title, description, category_id, condition,
      starting_price, bid_increment, duration_seconds, status
    ) values (
      v_seller,
      'Gaming laptop listed at ten crore',
      'A mid-range gaming laptop. The starting price is intentionally absurd so the admin queue can demonstrate the price-sanity flag from the brief.',
      v_electronics,
      'good',
      10000000000,
      500000,
      604800,
      'pending_review'
    );
  end if;

  if not exists (
    select 1 from public.listings
     where title = 'Assorted charging cables, mixed condition'
       and seller_id = v_seller
  ) then
    insert into public.listings (
      seller_id, title, description, category_id, condition,
      starting_price, bid_increment, duration_seconds,
      status, review_note, reviewed_by, reviewed_at
    ) values (
      v_seller,
      'Assorted charging cables, mixed condition',
      'A box of USB cables of various lengths and connectors. Some work, some do not. Sold as a lot.',
      v_electronics,
      'fair',
      20000,
      1000,
      3600,
      'rejected',
      'Please list items individually with a clear photo of each. A mixed lot of cables is too vague for a buyer to bid on.',
      '22222222-2222-4222-8222-000000000099',
      now() - interval '1 day'
    );
  end if;
end $$;


-- ===========================================================================
-- Phase 4 · verified bidders
--
-- place_bid requires kyc_status = 'verified'. That rule is enforced from the
-- moment the engine exists rather than being switched on in Phase 6, because a
-- validation rule that ships disabled has a habit of staying disabled.
--
-- So the demo needs accounts that can actually bid. These four are marked
-- verified directly, which is the ONE place in the project where kyc_status is
-- set outside an admin decision — the same bootstrap exemption the admin
-- account gets above, and for the same reason.
--
-- NO DOCUMENT NUMBER IS INVOLVED, here or anywhere. There is no
-- kyc_submissions row: `verified` is a status on the profile, and the thing it
-- attests to was never stored. See docs/COMPLIANCE.md §1.
--
-- They are deliberately NOT sellers. place_bid rejects a seller bidding on
-- their own listing, so a bidder who also owns listings would be unable to bid
-- on those and would make the demo confusing.
--
-- Sign in as any of these with demo-password-not-secret
-- ===========================================================================
do $$
declare
  v_emails text[] := array[
    'bidder-ishan@example.test',
    'bidder-priya@example.test',
    'bidder-arjun@example.test',
    'bidder-nisha@example.test'
  ];
  v_email text;
  v_id    uuid;
  v_n     integer := 0;
begin
  foreach v_email in array v_emails loop
    v_n := v_n + 1;
    v_id := ('33333333-3333-4333-8333-' || lpad(v_n::text, 12, '0'))::uuid;

    if not exists (select 1 from auth.users where id = v_id) then
      insert into auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        '00000000-0000-0000-0000-000000000000',
        v_id, 'authenticated', 'authenticated', v_email,
        crypt('demo-password-not-secret', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{}'::jsonb,
        now() - (v_n || ' days')::interval, now()
      );

      -- The trigger created the profile; mark it verified so it can bid.
      update public.profiles
         set kyc_status = 'verified'
       where id = v_id;
    end if;
  end loop;
end $$;
