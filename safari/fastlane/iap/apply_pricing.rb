#!/usr/bin/env ruby
# frozen_string_literal: true

# Apply a pricing plan produced by plan_pricing.rb.
#
# DRY RUN BY DEFAULT. Without --commit this prints the exact payloads it would
# send and writes nothing. --commit is the only thing that makes it mutate.
#
# ---------------------------------------------------------------------------
# The hazard this script exists to manage
# ---------------------------------------------------------------------------
# IAP prices are a *schedule*, and creating one REPLACES the whole thing. The
# manualPrices in the request become the complete set; any territory not included
# reverts to the automated price derived from baseTerritory.
#
# So applying a narrower plan after a wider one silently un-sets territories. A
# 4-territory pilot is safe today because everything is currently automatic, but
# once 141 territories are manual, applying a 4-territory plan would revert 137 of
# them. This script refuses that: it reads what is currently manual and aborts if
# the plan would drop any of it, unless --allow-reverts says otherwise.
#
# Subscriptions do not have this problem — they are individual per-territory
# resources, so a POST affects only the territory named.
#
# Auth: SPACESHIP_CONNECT_API_KEY_ID / _ISSUER_ID / _KEY_FILEPATH
#
# Usage:
#   bundle exec ruby fastlane/iap/apply_pricing.rb                    # dry run, latest plan
#   bundle exec ruby fastlane/iap/apply_pricing.rb --plan path.csv
#   bundle exec ruby fastlane/iap/apply_pricing.rb --commit

require "base64"
require "csv"
require "json"
require "optparse"
require "spaceship"

BUNDLE_ID = "com.moonloaf.geospoof"
POLICY = File.join(__dir__, "pricing-policy.json")
PLANS = File.join(__dir__, "plans")
V1 = "v1"
V2 = "v2"

opts = { commit: false, plan: nil, allow_reverts: false, tolerance: 0.0001 }
OptionParser.new do |o|
  o.on("--commit", "Actually send the requests. Without this, nothing is written.") { opts[:commit] = true }
  o.on("--plan PATH", "Plan CSV to apply. Defaults to the newest in plans/.") { |v| opts[:plan] = v }
  o.on("--allow-reverts", "Permit an apply that would revert currently-manual territories to automatic.") { opts[:allow_reverts] = true }
end.parse!

def die(msg)
  warn "\n[FATAL] #{msg}"
  exit 1
end

plan_path = opts[:plan] || Dir[File.join(PLANS, "plan-*.csv")].max
die "no plan found in #{PLANS} — run plan_pricing.rb first" unless plan_path && File.exist?(plan_path)
rows = CSV.read(plan_path, headers: true).map(&:to_h)
die "plan is empty: #{plan_path}" if rows.empty?
puts "plan: #{File.basename(plan_path)}  (#{rows.length} rows)"
puts opts[:commit] ? "MODE: COMMIT — requests will be sent" : "MODE: dry run — nothing will be written"

# Drop `unchanged` rows. Writing a manual price equal to the automatic one is
# actively harmful: it pins that territory to a fixed number and permanently ends
# Apple's FX and tax adjustment for it, in exchange for no price change at all.
# Every high-income territory sits at x1.0, so a full plan is mostly these — on a
# 157-territory run that would be ~47 territories opted out of maintenance for
# nothing. They belong in the plan (it shows they were considered) but not in an
# apply. For IAP schedules this falls out correctly: omitting them from the
# replace-all set leaves them automatic, which is exactly right.
unchanged = rows.select { |r| r["direction"] == "unchanged" }
rows = rows.reject { |r| r["direction"] == "unchanged" }
unless unchanged.empty?
  terrs = unchanged.map { |r| r["territory"] }.uniq.sort
  puts "skipping #{unchanged.length} `unchanged` row(s) across #{terrs.length} territories — leaving them on Apple automatic"
  puts "  (#{terrs.join(', ')})"
end
die "nothing to apply: every row in the plan was `unchanged`" if rows.empty?
puts "applying #{rows.length} row(s)"

policy = JSON.parse(File.read(POLICY))
base_territory = policy.fetch("base_storefront")

%w[SPACESHIP_CONNECT_API_KEY_ID SPACESHIP_CONNECT_API_ISSUER_ID SPACESHIP_CONNECT_API_KEY_FILEPATH].each do |v|
  die "missing env var #{v}" if ENV[v].to_s.empty?
end
token = Spaceship::ConnectAPI::Token.create
Spaceship::ConnectAPI.token = token
client = Spaceship::ConnectAPI::Tunes::Client.new(token: token)

def fetch(client, path, params = nil)
  resp = client.get(path, params)
  body = resp.respond_to?(:body) ? resp.body : resp
  body = JSON.parse(body) if body.is_a?(String)
  die "no `data` for GET #{path}\n  body=#{body.inspect[0, 600]}" unless body["data"]
  body
end

def fetch_all(client, path, params = {})
  out = []
  inc = []
  page = (params || {}).merge(limit: 200)
  loop do
    b = fetch(client, path, page)
    out.concat(Array(b["data"]))
    inc.concat(Array(b["included"]))
    nxt = b.dig("links", "next")
    break unless nxt
    path = nxt
    page = nil
  end
  [out, inc]
end

# --- resolve products -------------------------------------------------------
apps, = fetch_all(client, "#{V1}/apps", { "filter[bundleId]" => BUNDLE_ID })
app_id = apps.first["id"]
products = {}
groups, = fetch_all(client, "#{V1}/apps/#{app_id}/subscriptionGroups")
groups.each do |g|
  subs, = fetch_all(client, "#{V1}/subscriptionGroups/#{g['id']}/subscriptions")
  subs.each { |s| products[s.dig("attributes", "productId")] = { kind: :subscription, id: s["id"] } }
end
iaps, = fetch_all(client, "#{V1}/apps/#{app_id}/inAppPurchasesV2")
iaps.each { |p| products[p.dig("attributes", "productId")] = { kind: :iap, id: p["id"] } }

missing = rows.map { |r| r["product"] }.uniq - products.keys
die "plan references products that do not exist: #{missing}" unless missing.empty?

# --- the base territory's current price, per IAP ------------------------------
# A replace-all schedule must carry a price for its own baseTerritory. The plan
# never contains one: the planner reads its baseline from `automaticPrices` (IAP)
# and from `equalizations` (subscriptions), and the base territory appears in
# neither — it has a manual price, and equalizations returns the *other*
# territories. So USA is absent from all 928 rows by construction.
#
# Omitting it from manualPrices would delete the existing US manual price and
# leave the US price to be derived automatically from baseTerritory: USA, which is
# circular. Anchoring it at today's price makes the schedule a no-op for the US.
# Being manual is the base territory's normal state — it is where the price is set.
def base_price_point(client, prod, base_territory)
  %w[manualPrices automaticPrices].each do |rel|
    data, inc = fetch_all(client, "#{V1}/inAppPurchasePriceSchedules/#{prod[:id]}/#{rel}",
                          { "include" => "inAppPurchasePricePoint,territory" })
    prices = inc.select { |i| i["type"].to_s.include?("PricePoint") }
                .to_h { |i| [i["id"], i.dig("attributes", "customerPrice")] }
    row = data.find { |d| d.dig("relationships", "territory", "data", "id") == base_territory }
    next unless row
    pp_id = row.dig("relationships", "inAppPurchasePricePoint", "data", "id")
    next unless pp_id
    return { id: pp_id, price: prices[pp_id], source: rel }
  end
  nil
end

base_points = {}
iap_pids = rows.map { |r| r["product"] }.uniq.select { |pid| products[pid][:kind] == :iap }
unless iap_pids.empty?
  puts "\nresolving the #{base_territory} anchor price for #{iap_pids.length} one-time product(s)..."
  iap_pids.each do |pid|
    bp = base_price_point(client, products[pid], base_territory)
    die "cannot determine the current #{base_territory} price for #{pid}.\n" \
        "        Applying without it would drop that manual price and leave the\n" \
        "        #{base_territory} price derived from itself. Refusing." if bp.nil?
    base_points[pid] = bp
    puts "  #{pid}: #{bp[:price]} (from #{bp[:source]}) — will be re-sent unchanged"
  end
end

# --- guard 1: has the world moved since the plan was generated? -------------
# Apple adjusts automatic prices for FX and tax. If the live price no longer
# matches what the plan recorded, the plan's target was computed from a stale
# baseline and applying it would land somewhere nobody chose.
puts "\nverifying the plan against live prices..."
drift = []
rows.group_by { |r| r["product"] }.each do |pid, prows|
  prod = products[pid]
  paths =
    if prod[:kind] == :subscription
      [["#{V1}/subscriptions/#{prod[:id]}/prices", "subscriptionPricePoint,territory"]]
    else
      [["#{V1}/inAppPurchasePriceSchedules/#{prod[:id]}/automaticPrices", "inAppPurchasePricePoint,territory"],
       ["#{V1}/inAppPurchasePriceSchedules/#{prod[:id]}/manualPrices", "inAppPurchasePricePoint,territory"]]
    end
  live = {}
  paths.each do |path, includes|
    data, inc = fetch_all(client, path, { "include" => includes })
    pts = inc.select { |i| i["type"].to_s.include?("PricePoint") }
             .to_h { |i| [i["id"], i.dig("attributes", "customerPrice").to_f] }
    data.each do |row|
      next if row.dig("attributes", "preserved") == true
      pp_id = row.dig("relationships", "subscriptionPricePoint", "data", "id") ||
              row.dig("relationships", "inAppPurchasePricePoint", "data", "id")
      t = row.dig("relationships", "territory", "data", "id")
      live[t] = pts[pp_id] if pp_id && t
    end
  end
  prows.each do |r|
    planned = r["current"].to_f
    actual = live[r["territory"]]
    next if actual && (actual - planned).abs <= opts[:tolerance]
    drift << "#{pid} / #{r['territory']}: plan recorded #{planned}, live is #{actual.inspect}"
  end
end
if drift.empty?
  puts "  no drift — every row's baseline still matches"
else
  puts "  #{drift.length} row(s) drifted:"
  drift.first(20).each { |d| puts "    #{d}" }
  die "plan is stale. Re-run plan_pricing.rb and review the new plan."
end

# --- guard 2: would a replace-all schedule revert existing manual prices? ----
puts "\nchecking for territories that would revert to automatic..."
reverts = []
rows.group_by { |r| r["product"] }.select { |pid, _| products[pid][:kind] == :iap }.each do |pid, prows|
  prod = products[pid]
  data, = fetch_all(client, "#{V1}/inAppPurchasePriceSchedules/#{prod[:id]}/manualPrices",
                    { "include" => "territory" })
  currently_manual = data.map { |d| d.dig("relationships", "territory", "data", "id") }.compact
  planned = prows.map { |r| r["territory"] }
  # base_territory is exempt because the request builder re-sends it unchanged as
  # the schedule's anchor, so it is never actually dropped. That exemption is only
  # sound while base_points is populated — hence the die() above if it is not.
  dropped = currently_manual - planned - [base_territory]
  reverts << "#{pid}: #{dropped.length} territor#{dropped.length == 1 ? 'y' : 'ies'} would revert (#{dropped.sort.join(', ')})" unless dropped.empty?
end
if reverts.empty?
  puts "  none — no currently-manual territory is missing from the plan"
else
  reverts.each { |r| puts "  !! #{r}" }
  unless opts[:allow_reverts]
    die "this plan is narrower than what is already manual. Re-plan without --territories\n" \
        "        so the full set is covered, or pass --allow-reverts if reverting is intended."
  end
  puts "  proceeding anyway (--allow-reverts)"
end

# --- guard 3: does each chosen price point actually belong to its territory? -
# Price point ids are base64 JSON {"s":product,"t":territory,"p":tier}, so this is
# a cheap assertion against the class of bug where a target computed in one
# currency gets snapped against another territory's ladder.
puts "\nvalidating price point territories..."
mismatched = rows.reject do |r|
  id = r["price_point_id"].to_s
  padded = id + "=" * ((4 - id.length % 4) % 4)
  decoded = JSON.parse(Base64.decode64(padded)) rescue nil
  decoded.nil? || decoded["t"] == r["territory"]
end
if mismatched.empty?
  puts "  all #{rows.length} price points belong to the territory they were planned for"
else
  mismatched.first(10).each { |r| puts "  !! #{r['product']} / #{r['territory']} -> point is not for this territory" }
  die "price point / territory mismatch"
end

# --- build the requests -----------------------------------------------------
requests = []
rows.group_by { |r| r["product"] }.each do |pid, prows|
  prod = products[pid]
  if prod[:kind] == :subscription
    prows.each do |r|
      requests << {
        label: "#{pid} / #{r['territory']} -> #{r['chosen']} #{r['currency']}",
        path: "#{V1}/subscriptionPrices",
        body: {
          data: {
            type: "subscriptionPrices",
            attributes: {
              startDate: nil,
              # false so existing subscribers also get the lower price. These are
              # all decreases (increases are gated off in the policy), and leaving
              # subscribers above the new public price would be indefensible.
              preserveCurrentPrice: false
            },
            relationships: {
              subscription: { data: { type: "subscriptions", id: prod[:id] } },
              subscriptionPricePoint: { data: { type: "subscriptionPricePoints", id: r["price_point_id"] } },
              territory: { data: { type: "territories", id: r["territory"] } }
            }
          }
        }
      }
    end
  else
    # One replace-all schedule carrying every planned territory for this product,
    # plus the base territory pinned at its current price. The base entry is not a
    # price change — it exists so the replace-all does not delete the anchor. See
    # base_price_point above.
    entries = [{ territory: base_territory, point: base_points.fetch(pid)[:id] }] +
              prows.map { |r| { territory: r["territory"], point: r["price_point_id"] } }
    included = entries.each_with_index.map do |e, i|
      {
        type: "inAppPurchasePrices",
        id: "price-#{i}",
        attributes: { startDate: nil },
        relationships: {
          inAppPurchasePricePoint: { data: { type: "inAppPurchasePricePoints", id: e[:point] } },
          territory: { data: { type: "territories", id: e[:territory] } }
        }
      }
    end
    requests << {
      label: "#{pid} schedule -> #{prows.length} territories + #{base_territory} anchor " \
             "(#{prows.map { |r| r['territory'] }.sort.join(', ')})",
      path: "#{V1}/inAppPurchasePriceSchedules",
      body: {
        data: {
          type: "inAppPurchasePriceSchedules",
          relationships: {
            inAppPurchase: { data: { type: "inAppPurchases", id: prod[:id] } },
            baseTerritory: { data: { type: "territories", id: base_territory } },
            manualPrices: { data: included.map { |i| { type: i[:type], id: i[:id] } } }
          }
        },
        included: included
      }
    }
  end
end

puts "\n#{requests.length} request(s) to send:"
requests.each { |r| puts "  POST #{r[:path]}  #{r[:label]}" }

unless opts[:commit]
  puts "\n--- payloads (dry run) ---"
  requests.each do |r|
    puts "\nPOST #{r[:path]}"
    puts JSON.pretty_generate(r[:body])
  end
  puts "\nDry run complete. Nothing was written. Re-run with --commit to apply."
  exit 0
end

# --- send -------------------------------------------------------------------
puts "\nsending..."
failures = []
requests.each_with_index do |r, i|
  print "  [#{i + 1}/#{requests.length}] #{r[:label]} ... "
  begin
    client.post(r[:path], r[:body])
    puts "ok"
  rescue => e
    puts "FAILED"
    # 409 Conflict is the common failure here and rarely comes with a useful
    # message; surface whatever the body says.
    failures << "#{r[:label]}: #{e.class}: #{e.message[0, 400]}"
  end
end

if failures.empty?
  puts "\nall #{requests.length} request(s) succeeded."
  puts "Re-run plan_pricing.rb to verify: every row should come back as `unchanged`."
else
  puts "\n#{failures.length} of #{requests.length} failed:"
  failures.each { |f| puts "  #{f}" }
  puts "\nNote: subscription prices apply per territory, so successful ones stand."
  puts "IAP schedules are atomic per product — a failed product changed nothing."
  exit 1
end
