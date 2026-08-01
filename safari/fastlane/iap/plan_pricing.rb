#!/usr/bin/env ruby
# frozen_string_literal: true

# Produce a per-territory pricing PLAN for GeoSpoof's IAPs and subscriptions.
#
# READ-ONLY. GET requests only. Writes a CSV plan and a summary; never modifies
# App Store Connect. Applying is a separate, gated step so the plan can be
# reviewed first.
#
# ---------------------------------------------------------------------------
# CURRENCY: why the baseline is Apple's current local price, not a USD figure
# ---------------------------------------------------------------------------
# Price points are denominated in each territory's own currency — BRL in Brazil,
# JPY in Japan, INR in India, and USD in the territories Apple bills in dollars
# (Afghanistan among them). A USD-derived target cannot be compared against a
# BRL ladder: 2.99 * 0.6 = 1.79 is numerically below *every* Brazilian price
# point, so a nearest-match would silently pick Apple's cheapest BRL point.
#
# Instead the baseline is the product's CURRENT price in that territory, which is
# Apple's automated equalized price (FX and tax already applied, in the right
# currency). The tier multiplier scales that. No exchange rates are needed
# anywhere in this script, because Apple's own ladder already encodes them.
#
#   target_local = current_local_price * tier_multiplier
#
# That also makes the plan a natural diff against what is live today, which is
# what the increase check needs anyway.
#
# Auth via the same env vars spaceship uses (see spaceship/connect_api/token.rb):
#   SPACESHIP_CONNECT_API_KEY_ID / _ISSUER_ID / _KEY_FILEPATH
#
# Usage:
#   bundle exec ruby fastlane/iap/plan_pricing.rb --territories BRA,IND,JPN
#   bundle exec ruby fastlane/iap/plan_pricing.rb --products pro.monthly
#   bundle exec ruby fastlane/iap/plan_pricing.rb            # all classified
#
# RATE LIMITS: the price-points endpoints require a territory filter (App Store
# Connect API 3.6+), so it is one request per product per territory. 141 x 6 is
# ~850 calls before pagination, against roughly 3600/hour. Smoke-test a few
# territories before going wide.

require "json"
require "csv"
require "fileutils"
require "optparse"
require "spaceship"

BUNDLE_ID = "com.moonloaf.geospoof"
POLICY = File.join(__dir__, "pricing-policy.json")
OUT_DIR = File.join(__dir__, "plans")

options = { territories: nil, products: nil }
OptionParser.new do |o|
  o.on("--territories LIST") { |v| options[:territories] = v.split(",").map { |s| s.strip.upcase } }
  o.on("--products LIST") { |v| options[:products] = v.split(",").map(&:strip) }
end.parse!

policy = JSON.parse(File.read(POLICY))
tier_of = {}
policy["tiers"].each { |tier, codes| codes.each { |c| tier_of[c] = tier } }

def die(msg)
  warn "\n[FATAL] #{msg}"
  exit 1
end

%w[SPACESHIP_CONNECT_API_KEY_ID SPACESHIP_CONNECT_API_ISSUER_ID SPACESHIP_CONNECT_API_KEY_FILEPATH].each do |v|
  die "missing env var #{v}" if ENV[v].to_s.empty?
end

# Two things here are easy to get wrong and both fail on the first request.
#
# 1. Spaceship::ConnectAPI.client is a *wrapper* (ConnectAPI::Client) that
#    delegates named model methods. It has no #get / #post. The raw verbs live on
#    ConnectAPI::APIClient, which Tunes::Client subclasses — so construct that
#    directly.
#
# 2. Spaceship does NOT inject an API version. api_client.rb builds Faraday with
#    only the hostname, and every real call site writes the version into the path
#    itself ("#{Version::V1}/appInfos/..."). A path of "apps" resolves to
#    https://api.appstoreconnect.apple.com/apps and 404s. Versions must be
#    explicit, and they are not uniform: the IAP resource is v2 while its price
#    schedule is v1.
token = Spaceship::ConnectAPI::Token.create
Spaceship::ConnectAPI.token = token
client = Spaceship::ConnectAPI::Tunes::Client.new(token: token)
die "constructed client cannot issue raw GETs" unless client.respond_to?(:get)
puts "authenticated as key #{ENV['SPACESHIP_CONNECT_API_KEY_ID']}"

V1 = "v1"
V2 = "v2"

# Wrapper so an unexpected response shape is diagnosable on the first run rather
# than surfacing as a NoMethodError deep in a block.
def fetch(client, path, params = nil)
  resp = client.get(path, params)
  body = resp.respond_to?(:body) ? resp.body : resp
  body = JSON.parse(body) if body.is_a?(String)
  die "no `data` for GET #{path} params=#{params.inspect}\n  body=#{body.inspect[0, 800]}" unless body["data"]
  body
end

def fetch_all(client, path, params = {})
  out = []
  included = []
  page = (params || {}).merge(limit: 200)
  loop do
    body = fetch(client, path, page)
    out.concat(Array(body["data"]))
    included.concat(Array(body["included"]))
    nxt = body.dig("links", "next")
    break unless nxt
    path = nxt
    page = nil
  end
  [out, included]
end

# --- app, products ----------------------------------------------------------
apps, = fetch_all(client, "#{V1}/apps", { "filter[bundleId]" => BUNDLE_ID })
die "no app for bundle id #{BUNDLE_ID}" if apps.empty?
app_id = apps.first["id"]
puts "app id: #{app_id}"

products = []
groups, = fetch_all(client, "#{V1}/apps/#{app_id}/subscriptionGroups")
groups.each do |g|
  subs, = fetch_all(client, "#{V1}/subscriptionGroups/#{g['id']}/subscriptions")
  subs.each { |s| products << { kind: :subscription, id: s["id"], product_id: s.dig("attributes", "productId") } }
end
# The relationship is named inAppPurchasesV2 but hangs off the v1 app resource.
iaps, = fetch_all(client, "#{V1}/apps/#{app_id}/inAppPurchasesV2")
iaps.each { |p| products << { kind: :iap, id: p["id"], product_id: p.dig("attributes", "productId") } }

products.select! { |p| options[:products].any? { |f| p[:product_id].to_s.include?(f) } } if options[:products]
die "no products in scope" if products.empty?
puts "products in scope: #{products.length}"

# --- territories, with their currency --------------------------------------
terr_data, = fetch_all(client, "#{V1}/territories")
currency_of = terr_data.to_h { |t| [t["id"], t.dig("attributes", "currency")] }
all_terr = currency_of.keys
puts "App Store territories: #{all_terr.length}   distinct currencies: #{currency_of.values.uniq.compact.length}"

classified = all_terr.select { |t| tier_of.key?(t) }
unclassified = all_terr.reject { |t| tier_of.key?(t) }
stale = tier_of.keys - all_terr
scope = ((options[:territories] || classified) & all_terr)
puts "in policy but not an App Store territory: #{stale.inspect}" unless stale.empty?
puts "planning #{scope.length} territories (#{unclassified.length} left on Apple automatic)"

# --- current prices, per product, keyed by territory ------------------------
# This is the baseline. Endpoints differ between subscriptions and IAPs and are
# the part of this script most likely to need adjusting on first contact, so any
# surprise is reported loudly rather than defaulted away.
def current_prices(client, prod)
  # Subscriptions and IAPs use entirely different pricing models, which is the
  # single biggest source of confusion in this API.
  #
  #   Subscriptions: individual subscriptionPrices resources, one per territory.
  #   IAPs:          a single inAppPurchasePriceSchedule whose id IS the IAP id,
  #                  holding a set of manualPrices.
  path, params =
    if prod[:kind] == :subscription
      ["#{V1}/subscriptions/#{prod[:id]}/prices",
       { "include" => "subscriptionPricePoint,territory", "limit" => 200 }]
    else
      ["#{V1}/inAppPurchasePriceSchedules/#{prod[:id]}/manualPrices",
       { "include" => "inAppPurchasePricePoint,territory", "limit" => 200 }]
    end

  data, included = fetch_all(client, path, params)
  points = included.select { |i| i["type"].to_s.include?("PricePoint") }
                   .to_h { |i| [i["id"], i.dig("attributes", "customerPrice").to_f] }
  terrs = included.select { |i| i["type"] == "territories" }.map { |i| i["id"] }

  out = {}
  data.each do |row|
    # `preserved: true` marks the price retained for existing subscribers after a
    # change. Skip those — the live selling price is the non-preserved row, and
    # taking the preserved one would scale from a stale baseline.
    next if row.dig("attributes", "preserved") == true
    pp_id = row.dig("relationships", "subscriptionPricePoint", "data", "id") ||
            row.dig("relationships", "inAppPurchasePricePoint", "data", "id")
    t = row.dig("relationships", "territory", "data", "id")
    next unless pp_id && t
    out[t] = points[pp_id]
  end
  [out, data.length, terrs.length]
end

def endings_for(policy, terr, currency)
  policy.dig("attractive_endings", terr) ||
    policy.dig("attractive_endings", currency) ||
    policy.dig("attractive_endings", "default") || [0.99]
end

def snap(points, target, endings, tie_break, rounding)
  return nil if points.empty?
  dir = tie_break == "dearer" ? -1 : 1
  candidates = points
  if rounding == "down"
    at_or_below = points.select { |p| p[:price] <= target + 0.0001 }
    candidates = at_or_below.empty? ? [points.min_by { |p| p[:price] }] : at_or_below
  end
  candidates.min_by do |p|
    price = p[:price]
    frac = (price - price.floor).round(2)
    rank = endings.index { |e| (frac - (e.to_f % 1)).abs < 0.005 } || endings.length
    [(price - target).abs.round(4), rank, dir * price]
  end
end

# --- build the plan ---------------------------------------------------------
rows = []
warnings = []
tie_break = policy.fetch("tie_break", "cheaper")
rounding = policy.fetch("rounding", "nearest")
allow_inc_one_time = policy.fetch("allow_increases_one_time", false)
allow_inc_sub = policy.fetch("allow_increases_subscription", false)
puts "increases permitted — one-time: #{allow_inc_one_time}   subscription: #{allow_inc_sub}"

products.each do |prod|
  baseline, n_rows, n_terr = current_prices(client, prod)
  puts "  #{prod[:product_id]}: current prices for #{baseline.length} territories (#{n_rows} rows, #{n_terr} territory refs)"
  if baseline.empty?
    warnings << "#{prod[:product_id]}: no current prices returned — cannot establish a local baseline, product skipped"
    next
  end

  # Version differs by product type: the IAP resource is v2, the subscription v1.
  pp_path = prod[:kind] == :subscription ? "#{V1}/subscriptions/#{prod[:id]}/pricePoints" : "#{V2}/inAppPurchases/#{prod[:id]}/pricePoints"

  scope.each_with_index do |terr, i|
    cur = baseline[terr]
    if cur.nil?
      warnings << "#{prod[:product_id]} / #{terr}: no current price, skipped (no baseline to scale)"
      next
    end
    currency = currency_of[terr]
    tier = tier_of[terr]
    # A per-country coefficient wins over the income tier. Tiers are a decent
    # default but wrong in specific markets (Turkey and India especially), and
    # distorting a whole tier to fix one country is worse than overriding it.
    coeff = policy.dig("coefficient_overrides", terr)
    mult = coeff || policy["tier_multipliers"][tier]
    basis_kind = coeff ? "coefficient" : "tier"
    override = policy.dig("territory_overrides", terr, prod[:product_id])

    pts, = fetch_all(client, pp_path, { "filter[territory]" => terr })
    available = pts.map { |p| { id: p["id"], price: p.dig("attributes", "customerPrice").to_f } }
    if available.empty?
      warnings << "#{prod[:product_id]} / #{terr}: no price points returned"
      next
    end

    # Both branches are in local currency: the override is authored that way, and
    # the tier target scales Apple's own local equalized price.
    target = override ? override.to_f : (cur * mult)
    chosen = snap(available, target, endings_for(policy, terr, currency), tie_break, rounding)

    delta = chosen[:price] - cur
    is_increase = delta > 0.0001
    # Increases are gated by product type: a one-time purchase has no subscribers
    # to consent, a subscription does. See allow_increases_* in the policy.
    permitted = prod[:kind] == :subscription ? allow_inc_sub : allow_inc_one_time
    if is_increase && !permitted
      warnings << "#{prod[:product_id]} / #{terr}: would INCREASE #{cur} -> #{chosen[:price]} #{currency}; dropped (#{prod[:kind]} increases disabled)"
      next
    end

    rows << {
      product: prod[:product_id], kind: prod[:kind], territory: terr, currency: currency,
      tier: tier, basis: override ? "override(local)" : "#{basis_kind} x #{mult}",
      current: cur, target: target.round(2), chosen: chosen[:price],
      delta_pct: cur.zero? ? "" : ((delta / cur) * 100).round(1),
      direction: is_increase ? "increase" : (delta.abs < 0.0001 ? "unchanged" : "decrease"),
      price_point_id: chosen[:id],
      needs_review: policy.dig("needs_review", "territories").include?(terr)
    }
    print "\r    #{prod[:product_id]}  #{i + 1}/#{scope.length}   "
  end
  puts
end

FileUtils.mkdir_p(OUT_DIR)
stamp = Time.now.utc.strftime("%Y%m%dT%H%M%SZ")
csv_path = File.join(OUT_DIR, "plan-#{stamp}.csv")
cols = %i[product kind territory currency tier basis current target chosen delta_pct direction price_point_id needs_review]
CSV.open(csv_path, "w") do |csv|
  csv << cols.map(&:to_s)
  rows.each { |r| csv << r.values_at(*cols) }
end

puts "\nplan rows: #{rows.length}   written: #{csv_path}"
by_dir = rows.group_by { |r| r[:direction] }.transform_values(&:length)
puts "by direction: #{by_dir}"
flagged = rows.count { |r| r[:needs_review] }
puts "rows in needs_review territories: #{flagged}"
unless unclassified.empty?
  puts "\nUNCLASSIFIED (kept on Apple automatic — add a tier to include them):"
  puts "  " + unclassified.sort.join(", ")
end
unless warnings.empty?
  puts "\nWARNINGS (#{warnings.length}):"
  warnings.first(40).each { |w| puts "  #{w}" }
  puts "  ... #{warnings.length - 40} more" if warnings.length > 40
end
puts "\nNothing was modified."
