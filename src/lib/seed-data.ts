// First-run data for the garden: the seed library (transcribed from the packet
// fronts and backs in seed/photos) and the plantings from the handwritten plan.

export type Milestone = {
  key: string;
  title: string;
  /** Days counted from the sow date or from the first "sprouted" event. */
  from: "sown" | "sprouted";
  dayMin: number;
  dayMax: number;
  /** Logging an event of this type marks the milestone done. */
  event: EventType;
  detail?: string;
};

export const EVENT_TYPES = [
  "watered",
  "sprouted",
  "thinned",
  "pinched",
  "fertilized",
  "potted_up",
  "transplanted",
  "harvested",
  "other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const PLANTING_STATUSES = [
  "planned",
  "sown",
  "sprouted",
  "growing",
  "transplanted",
  "harvesting",
  "done",
  "failed",
] as const;
export type PlantingStatus = (typeof PLANTING_STATUSES)[number];

export type SpeciesSeed = {
  slug: string;
  commonName: string;
  variety: string | null;
  scientificName: string;
  wikipediaTitle: string;
  category: "herb" | "vegetable" | "succulent";
  lifecycle: "annual" | "perennial" | "biennial";
  source: string | null;
  seedsPerPacket: string | null;
  sowDepth: string | null;
  light: string | null;
  germDaysMin: number | null;
  germDaysMax: number | null;
  height: string | null;
  spread: string | null;
  spacing: string | null;
  soil: string | null;
  watering: string | null;
  /** Once past the seedling stage, how often it typically wants water. */
  waterEveryDays: number;
  harvestDaysMin: number | null;
  harvestDaysMax: number | null;
  uses: string | null;
  packetText: string | null;
  tips: string[];
  milestones: Milestone[];
  hasPacketImages: boolean;
};

const thin = (dayMin = 7, dayMax = 14): Milestone => ({
  key: "thin",
  title: "Thin to the strongest seedling(s)",
  from: "sprouted",
  dayMin,
  dayMax,
  event: "thinned",
  detail: "Snip extras at soil level with scissors instead of pulling, so roots of the keeper aren't disturbed.",
});

const feed = (dayMin = 14, dayMax = 21): Milestone => ({
  key: "feed",
  title: "First light feeding (half-strength)",
  from: "sprouted",
  dayMin,
  dayMax,
  event: "fertilized",
  detail: "Once the first true leaves (not the seed leaves) open, feed with a half-strength balanced liquid fertilizer.",
});

export const SPECIES: SpeciesSeed[] = [
  {
    slug: "rosemary",
    commonName: "Rosemary",
    variety: "Herb",
    scientificName: "Salvia rosmarinus",
    wikipediaTitle: "Rosemary",
    category: "herb",
    lifecycle: "perennial",
    source: "Seed Needs",
    seedsPerPacket: "~100",
    sowDepth: "Surface sow (needs light to germinate)",
    light: "Full sun",
    germDaysMin: 14,
    germDaysMax: 28,
    height: '12"–36"',
    spread: '36"',
    spacing: '12"–16"',
    soil: "Well-drained, loamy",
    watering: "Lightly water at the roots daily while young",
    waterEveryDays: 3,
    harvestDaysMin: 85,
    harvestDaysMax: 120,
    uses: "Culinary & medicinal",
    packetText:
      "Rosemary benefits from cold stratification to germinate and can be slow. The seed also requires light to germinate, so make sure to not cover them. Sow indoors in CowPots 10 to 12 weeks prior to the last frost. Transplant or direct sow when temperatures are at least 65F. Slow grower.",
    tips: [
      "Germination is slow and patchy — don't give up on the cell before ~4 weeks.",
      "Keep the surface moist with a mister; seeds sit on top and dry out fast.",
      "Once established, let the soil dry between waterings — rosemary hates wet feet.",
    ],
    milestones: [
      thin(14, 21),
      feed(21, 28),
      { key: "pot-up", title: "Pot up into its own container", from: "sown", dayMin: 56, dayMax: 84, event: "potted_up" },
      { key: "harvest", title: "First light harvest of sprigs", from: "sown", dayMin: 85, dayMax: 120, event: "harvested" },
    ],
    hasPacketImages: true,
  },
  {
    slug: "thyme",
    commonName: "Thyme",
    variety: "German / Winter",
    scientificName: "Thymus vulgaris",
    wikipediaTitle: "Thymus_vulgaris",
    category: "herb",
    lifecycle: "perennial",
    source: "Seed Needs",
    seedsPerPacket: "~500",
    sowDepth: "Surface sow (tiny seeds, need light)",
    light: "Full sun",
    germDaysMin: 7,
    germDaysMax: 10,
    height: '16"',
    spread: '12"–16"',
    spacing: '8"–12"',
    soil: "Prefers sandy, loamy soil",
    watering: "Water with a mist setting",
    waterEveryDays: 3,
    harvestDaysMin: 75,
    harvestDaysMax: 95,
    uses: "Culinary & medicinal",
    packetText:
      "Thyme can be started in the garden indoors or outdoors. If started inside, sow in CowPots 6 to 8 weeks prior to the last frost. Seeds can be surface sown as they are very tiny and need light to germinate. Transplant or direct sow in the garden when temperatures are 65F or more. Snip young plants to encourage branching around 3 weeks.",
    tips: [
      "Snip the tips of young plants around 3 weeks to encourage bushy branching.",
      "Mist rather than pour — the seedlings are tiny and easily knocked over.",
    ],
    milestones: [
      thin(7, 14),
      { key: "pinch", title: "Snip tips to encourage branching", from: "sown", dayMin: 21, dayMax: 28, event: "pinched" },
      feed(14, 21),
      { key: "transplant", title: "Transplant (once nights stay above ~65°F or into a bigger pot)", from: "sown", dayMin: 42, dayMax: 56, event: "transplanted" },
      { key: "harvest", title: "Start harvesting sprigs", from: "sown", dayMin: 75, dayMax: 95, event: "harvested" },
    ],
    hasPacketImages: true,
  },
  {
    slug: "dill",
    commonName: "Dill",
    variety: "Bouquet",
    scientificName: "Anethum graveolens",
    wikipediaTitle: "Dill",
    category: "herb",
    lifecycle: "annual",
    source: "Seed Needs",
    seedsPerPacket: "~100",
    sowDepth: '1/8"',
    light: "Full sun",
    germDaysMin: 7,
    germDaysMax: 14,
    height: "Up to 30\"",
    spread: '12"–18"',
    spacing: '12"',
    soil: "Adaptable to many soils",
    watering: "Needs less water with age",
    waterEveryDays: 3,
    harvestDaysMin: 40,
    harvestDaysMax: 60,
    uses: "Culinary herb",
    packetText:
      "Dill does not transplant well, so if you are starting indoors, we recommend utilizing biodegradable CowPots. Transplant or direct sow in early spring when temperatures reach at least 65F. Cut leaves for use in culinary dishes at any time.",
    tips: [
      "Dill has a taproot and hates being disturbed — transplant the whole plug with minimal root handling.",
      "Leaves can be cut any time once the plant is ~8\" tall.",
    ],
    milestones: [
      thin(7, 14),
      feed(14, 21),
      { key: "transplant", title: "Transplant whole plug (dill dislikes root disturbance)", from: "sown", dayMin: 21, dayMax: 35, event: "transplanted" },
      { key: "harvest", title: "Start cutting leaves", from: "sown", dayMin: 40, dayMax: 60, event: "harvested" },
    ],
    hasPacketImages: true,
  },
  {
    slug: "basil",
    commonName: "Basil",
    variety: "Sweet",
    scientificName: "Ocimum basilicum",
    wikipediaTitle: "Basil",
    category: "herb",
    lifecycle: "annual",
    source: "Seed Needs",
    seedsPerPacket: "~200",
    sowDepth: '1/8"',
    light: "Full sun",
    germDaysMin: 7,
    germDaysMax: 14,
    height: '12"–18"',
    spread: '12"–18"',
    spacing: '12"',
    soil: "Well-drained, rich soil",
    watering: "Water daily",
    waterEveryDays: 1,
    harvestDaysMin: 50,
    harvestDaysMax: 70,
    uses: "Culinary",
    packetText:
      "Sow indoors in CowPots, 6 to 8 weeks prior to the last frost. Direct sow or transplant when temperatures are above 65F. Basil harvest can be extended if you pinch off the flowers as soon as they appear. Grow indoors with grow lights or directly outside with natural light.",
    tips: [
      "Pinch off flower buds as soon as they appear to keep leaves coming.",
      "Once it has 3 sets of true leaves, pinch the top set to make it bushy.",
      "Basil sulks below ~50°F — keep it warm.",
    ],
    milestones: [
      thin(7, 14),
      feed(14, 21),
      { key: "pinch", title: "Pinch the growing tip above the 3rd set of leaves", from: "sown", dayMin: 30, dayMax: 45, event: "pinched" },
      { key: "transplant", title: "Transplant when it's above 65°F", from: "sown", dayMin: 42, dayMax: 56, event: "transplanted" },
      { key: "harvest", title: "Start harvesting leaves (top down)", from: "sown", dayMin: 50, dayMax: 70, event: "harvested" },
    ],
    hasPacketImages: true,
  },
  {
    slug: "oregano",
    commonName: "Oregano",
    variety: "Italian",
    scientificName: "Origanum vulgare",
    wikipediaTitle: "Oregano",
    category: "herb",
    lifecycle: "perennial",
    source: "Seed Needs",
    seedsPerPacket: "~500",
    sowDepth: "Surface sow (needs light to germinate)",
    light: "Full sun",
    germDaysMin: 7,
    germDaysMax: 14,
    height: '12"–18"',
    spread: '12"–18"',
    spacing: '12"',
    soil: "Adaptable / neutral soils",
    watering: "Water daily with a mist",
    waterEveryDays: 3,
    harvestDaysMin: 80,
    harvestDaysMax: 90,
    uses: "Culinary & medicinal",
    packetText:
      "Oregano seeds are extremely small, so be careful when handling. The seed requires light to germinate, so its best sown directly to the surface of the soil. Start in CowPots, 6 to 8 weeks prior to the last frost. Transplant when temperatures are at least 65F. Grow indoors or directly out in the garden.",
    tips: ["Seeds are tiny — mist, don't pour.", "Flavor is strongest just before flowering."],
    milestones: [
      thin(7, 14),
      feed(14, 21),
      { key: "transplant", title: "Transplant when it's at least 65°F", from: "sown", dayMin: 42, dayMax: 56, event: "transplanted" },
      { key: "harvest", title: "Start harvesting sprigs", from: "sown", dayMin: 80, dayMax: 90, event: "harvested" },
    ],
    hasPacketImages: true,
  },
  {
    slug: "cilantro",
    commonName: "Cilantro",
    variety: "Slow Bolting",
    scientificName: "Coriandrum sativum",
    wikipediaTitle: "Coriander",
    category: "herb",
    lifecycle: "annual",
    source: "Seed Needs",
    seedsPerPacket: "~200",
    sowDepth: '1/4"',
    light: "Full sun",
    germDaysMin: 7,
    germDaysMax: 14,
    height: 'Up to 30"',
    spread: '12"',
    spacing: '12"',
    soil: "Adaptable to many soils",
    watering: "Water daily",
    waterEveryDays: 2,
    harvestDaysMin: 45,
    harvestDaysMax: 70,
    uses: "Culinary",
    packetText:
      "Sow indoors in CowPots, 6 to 8 weeks prior to the last frost. Direct sow or transplant when temperatures are above 55F. Cooler temperatures prior to Summer are preferred, although this variety is slower to bolt than other cilantro varieties.",
    tips: [
      "Prefers cool weather — fall/winter is a great season for it.",
      "Like dill, it has a taproot; move it as a whole plug.",
      "Sow a new cell every 3 weeks for a continuous supply.",
    ],
    milestones: [
      thin(7, 14),
      feed(14, 21),
      { key: "transplant", title: "Transplant whole plug (above 55°F)", from: "sown", dayMin: 21, dayMax: 35, event: "transplanted" },
      { key: "harvest", title: "Start cutting outer leaves", from: "sown", dayMin: 45, dayMax: 70, event: "harvested" },
    ],
    hasPacketImages: true,
  },
  {
    slug: "parsley",
    commonName: "Parsley",
    variety: "Italian Flat Leaf",
    scientificName: "Petroselinum crispum",
    wikipediaTitle: "Parsley",
    category: "herb",
    lifecycle: "biennial",
    source: "Seed Needs",
    seedsPerPacket: "~200",
    sowDepth: '1/8"',
    light: "Full sun",
    germDaysMin: 14,
    germDaysMax: 21,
    height: '15"–18"',
    spread: '8"–12"',
    spacing: '12"',
    soil: "Well-drained, rich fertile soil",
    watering: "Water daily",
    waterEveryDays: 2,
    harvestDaysMin: 70,
    harvestDaysMax: 90,
    uses: "Culinary",
    packetText:
      "Sow indoors in CowPots, 6 to 8 weeks prior to the last frost. Direct sow or transplant when temperatures are above 65F. Grow indoors with grow lights or directly outside with natural light. Best when picked early in the day.",
    tips: ["Parsley is slow to sprout (2–3 weeks) — keep it evenly moist.", "Best picked early in the day; harvest outer stems first."],
    milestones: [
      thin(7, 14),
      feed(14, 21),
      { key: "transplant", title: "Transplant when it's above 65°F", from: "sown", dayMin: 49, dayMax: 63, event: "transplanted" },
      { key: "harvest", title: "Start harvesting outer stems", from: "sown", dayMin: 70, dayMax: 90, event: "harvested" },
    ],
    hasPacketImages: true,
  },
  {
    slug: "sage",
    commonName: "Sage",
    variety: "Broad Leaved",
    scientificName: "Salvia officinalis",
    wikipediaTitle: "Salvia_officinalis",
    category: "herb",
    lifecycle: "perennial",
    source: "Seed Needs",
    seedsPerPacket: "~100",
    sowDepth: '1/4"',
    light: "Full sun",
    germDaysMin: 7,
    germDaysMax: 21,
    height: 'Up to 24"',
    spread: "2'–3'",
    spacing: '12"–18"',
    soil: "Enjoys dry to neutral soils",
    watering: "Water the seeds daily",
    waterEveryDays: 4,
    harvestDaysMin: 75,
    harvestDaysMax: 90,
    uses: "Culinary & medicinal",
    packetText:
      "Start seeds indoors or outdoors. Sow in CowPots for easy transplanting later on, or sow in permanent pots indoors. Spray the seed lightly each day and provide warmth and light. If transplanting outdoors, wait until temperatures are at least 65F.",
    tips: ["Spray seeds lightly each day and keep warm.", "Once established, sage prefers to dry out between waterings."],
    milestones: [
      thin(7, 14),
      feed(14, 21),
      { key: "transplant", title: "Transplant / pot up (outdoors once ≥65°F)", from: "sown", dayMin: 42, dayMax: 56, event: "transplanted" },
      { key: "harvest", title: "Light harvest of leaves", from: "sown", dayMin: 75, dayMax: 90, event: "harvested" },
    ],
    hasPacketImages: true,
  },
  {
    slug: "lavender",
    commonName: "Lavender",
    variety: "English",
    scientificName: "Lavandula angustifolia",
    wikipediaTitle: "Lavandula_angustifolia",
    category: "herb",
    lifecycle: "perennial",
    source: "Burpee",
    seedsPerPacket: null,
    sowDepth: "Barely cover",
    light: "Full sun (6+ hours)",
    germDaysMin: 14,
    germDaysMax: 21,
    height: '30"',
    spread: null,
    spacing: '12"',
    soil: "Lean, very well-drained",
    watering: "Keep moist until seedlings emerge, then let dry between waterings",
    waterEveryDays: 4,
    harvestDaysMin: 90,
    harvestDaysMax: 120,
    uses: "Fragrance, sachets, culinary",
    packetText:
      "Foliage and flowers have wonderful scent. Use dried to make sachets. Perennial, zones 6-9. START INDOORS 8-10 weeks before last anticipated spring frost. Gently press seeds into seed starting formula and keep moist. Seedlings emerge in 14-21 days. Transplant to larger containers when seedlings have at least two pairs of leaves. Container friendly: 1 plant per 12\" container.",
    tips: [
      "Germination can be erratic; a few weeks of cold stratification helps if nothing appears.",
      "Pot up into larger containers once seedlings have two pairs of true leaves.",
      "One plant per 12\" container.",
    ],
    milestones: [
      thin(10, 21),
      feed(21, 28),
      { key: "pot-up", title: "Pot up once it has 2 pairs of true leaves", from: "sprouted", dayMin: 21, dayMax: 35, event: "potted_up" },
      { key: "harvest", title: "First flower/foliage harvest", from: "sown", dayMin: 90, dayMax: 120, event: "harvested" },
    ],
    hasPacketImages: true,
  },
  {
    slug: "mint",
    commonName: "Mint",
    variety: null,
    scientificName: "Mentha",
    wikipediaTitle: "Mentha",
    category: "herb",
    lifecycle: "perennial",
    source: null,
    seedsPerPacket: null,
    sowDepth: "Surface sow, barely cover",
    light: "Full sun to part shade",
    germDaysMin: 10,
    germDaysMax: 16,
    height: '12"–24"',
    spread: "Spreads aggressively",
    spacing: '18"–24"',
    soil: "Moist, rich",
    watering: "Keep evenly moist",
    waterEveryDays: 2,
    harvestDaysMin: 70,
    harvestDaysMax: 90,
    uses: "Culinary, tea",
    packetText: null,
    tips: ["Packet coming soon — update this entry with the packet details.", "Grow mint in its own container; it spreads by runners."],
    milestones: [
      thin(7, 14),
      feed(14, 21),
      { key: "pot-up", title: "Pot up into its own container", from: "sown", dayMin: 42, dayMax: 56, event: "potted_up" },
      { key: "harvest", title: "Start harvesting sprigs", from: "sown", dayMin: 70, dayMax: 90, event: "harvested" },
    ],
    hasPacketImages: false,
  },
  {
    slug: "cauliflower",
    commonName: "Cauliflower",
    variety: "Pureza",
    scientificName: "Brassica oleracea var. botrytis",
    wikipediaTitle: "Cauliflower",
    category: "vegetable",
    lifecycle: "annual",
    source: "Epic Gardening",
    seedsPerPacket: "20",
    sowDepth: '1/8"',
    light: "Full sun",
    germDaysMin: 8,
    germDaysMax: 10,
    height: null,
    spread: null,
    spacing: 'A group of 3 seeds every 24"',
    soil: "Rich, consistently moist",
    watering: "Keep evenly moist",
    waterEveryDays: 2,
    harvestDaysMin: 75,
    harvestDaysMax: 90,
    uses: "Vegetable — beautiful, tightly-wrapped white heads",
    packetText:
      "Sow outside: 1 to 2 weeks before your average last frost date, or 10 to 12 weeks before your average first fall frost date. In mild climates, sow in early fall for winter harvest. Start inside (we recommend): 4 to 6 weeks before transplanting outside after your average last frost date, or 12 weeks before your average first fall frost date. In mild climates, sow in fall for harvest in late winter and early spring.",
    tips: [
      "Cool-season crop — fall sowing suits it.",
      "When the head is ~2\" across, fold the outer leaves over it (blanching) to keep it white.",
      "Inconsistent water causes small 'buttoned' heads.",
    ],
    milestones: [
      thin(7, 10),
      feed(14, 21),
      { key: "transplant", title: "Harden off & transplant outside", from: "sown", dayMin: 28, dayMax: 42, event: "transplanted" },
      { key: "harvest", title: "Harvest the head while curds are tight", from: "sown", dayMin: 75, dayMax: 90, event: "harvested" },
    ],
    hasPacketImages: true,
  },
  {
    slug: "broccoli",
    commonName: "Broccoli",
    variety: "Marathon",
    scientificName: "Brassica oleracea var. italica",
    wikipediaTitle: "Broccoli",
    category: "vegetable",
    lifecycle: "annual",
    source: "Epic Gardening",
    seedsPerPacket: "20",
    sowDepth: '1/8"',
    light: "Full sun",
    germDaysMin: 7,
    germDaysMax: 14,
    height: null,
    spread: null,
    spacing: 'A group of 3 seeds every 24"',
    soil: "Rich, well-drained; soil ≥40°F (ideally 60–85°F)",
    watering: "Keep evenly moist",
    waterEveryDays: 2,
    harvestDaysMin: 68,
    harvestDaysMax: 80,
    uses: "Vegetable — big, blue-green heads",
    packetText:
      "Sow outside: 4 to 6 weeks before your average last frost date, or when soil temperature is at least 40F, ideally 60-85F. Also in late summer for fall harvest. Mild climates: best sown in fall or winter for cool-season harvest. Start inside (we recommend): 4 to 6 weeks before your average last frost date. Transplant 1 to 2 weeks before your average last frost date.",
    tips: ["Harvest the main head before the buds open; side shoots keep coming after.", "Cool-season crop."],
    milestones: [
      thin(7, 10),
      feed(14, 21),
      { key: "transplant", title: "Harden off & transplant outside", from: "sown", dayMin: 28, dayMax: 42, event: "transplanted" },
      { key: "harvest", title: "Harvest the main head (before buds open)", from: "sown", dayMin: 68, dayMax: 80, event: "harvested" },
    ],
    hasPacketImages: true,
  },
  {
    slug: "bunching-onion",
    commonName: "Bunching Onion",
    variety: "Evergreen Hardy White",
    scientificName: "Allium fistulosum",
    wikipediaTitle: "Allium_fistulosum",
    category: "vegetable",
    lifecycle: "perennial",
    source: "Southern Exposure Seed Exchange (organic)",
    seedsPerPacket: "1 g (~450 seeds)",
    sowDepth: '1/4"',
    light: "Full sun",
    germDaysMin: 5,
    germDaysMax: 14,
    height: null,
    spread: null,
    spacing: '6"–12" (clumps of ~10); rows 18"–24"',
    soil: "Fertile, well-drained; soil 50–95°F",
    watering: "Even moisture",
    waterEveryDays: 2,
    harvestDaysMin: 60,
    harvestDaysMax: 75,
    uses: "Vegetable — scallion-like stalks",
    packetText:
      "60 days. Very hardy; may be left in the ground year-round in most regions. A first-class perennial onion; needs only occasional division once established. Resistant to thrips, smut, and pink root. Culture: Sow indoors in shallow pots or flats, late winter through early fall. Transplant out at 4-6 in., or as soon as the soil can be worked. For easiest weeding, we recommend planting in clumps of 10 seedlings at a 6-12 in. spacing. Provide fertile, well-drained soil and even moisture. Hill or deeply mulch to increase white portion. Provide deep mulch through winter. Harvest: Once the clumps are well established and dividing, pull onions as needed for fresh use.",
    tips: [
      "Don't thin to one — onions are planted out as clumps of ~10 seedlings.",
      "Transplant at 4–6\" tall.",
      "Hill soil or mulch around the stems for longer white portions.",
    ],
    milestones: [
      feed(14, 21),
      { key: "transplant", title: "Transplant clumps at 4–6\" tall", from: "sown", dayMin: 35, dayMax: 56, event: "transplanted" },
      { key: "harvest", title: "Pull onions as needed", from: "sown", dayMin: 60, dayMax: 75, event: "harvested" },
    ],
    hasPacketImages: true,
  },
  {
    slug: "lettuce",
    commonName: "Lettuce",
    variety: "Crisphead 'Great Lakes 118'",
    scientificName: "Lactuca sativa",
    wikipediaTitle: "Iceberg_lettuce",
    category: "vegetable",
    lifecycle: "annual",
    source: "Botanical Interests (heirloom)",
    seedsPerPacket: "1 g",
    sowDepth: 'Surface to 1/8" (light aids germination)',
    light: "Full sun to part shade",
    germDaysMin: 5,
    germDaysMax: 10,
    height: null,
    spread: null,
    spacing: 'A group of 3 seeds every 8"; rows 10"; thin to 1 every 8"',
    soil: "Soil ≥40°F, ideally 60–70°F",
    watering: "Keep evenly moist",
    waterEveryDays: 1,
    harvestDaysMin: 68,
    harvestDaysMax: 82,
    uses: "Vegetable — classic iceberg crunch; also a nice baby green",
    packetText:
      "No other lettuce type provides the incredible, cool crunch of crisphead (also called iceberg). 'Great Lakes 118' is a 1960s improvement over the original 'Great Lakes'; heat tolerant, and bolt resistant. When to sow outside: RECOMMENDED. 2 to 4 weeks before your average last frost date, and when soil temperature is at least 40F, ideally 60-70F. Successive sowings: every 3 weeks until 4 to 6 weeks before your average first fall frost date. Mild climates: sow in fall and winter for cool season harvests. When to start inside: 4 to 6 weeks before your average last frost date, and in summer when soil temperatures are too warm (above 80F) to germinate lettuce seed. Special germination instructions: light aids germination, sow shallowly. Thinning: when 1/2\" tall, thin to 1 every 8\". Maturity: 68-82 days.",
    tips: [
      "Leggy, stretched seedlings mean they need more light — move closer to the window or grow light.",
      "Thin when 1/2\" tall.",
      "Sow a new batch every ~3 weeks for a continuous harvest.",
      "Thinnings and young leaves make a nice baby green.",
    ],
    milestones: [
      { ...thin(3, 7), title: 'Thin when ~1/2" tall', detail: "Snip extras at soil level; eat the thinnings as micro-greens." },
      feed(14, 21),
      { key: "transplant", title: "Harden off & transplant", from: "sown", dayMin: 28, dayMax: 42, event: "transplanted" },
      { key: "harvest", title: "Harvest heads (baby leaves earlier)", from: "sown", dayMin: 68, dayMax: 82, event: "harvested" },
    ],
    hasPacketImages: true,
  },
  {
    slug: "aloe",
    commonName: "Aloe",
    variety: null,
    scientificName: "Aloe vera",
    wikipediaTitle: "Aloe_vera",
    category: "succulent",
    lifecycle: "perennial",
    source: null,
    seedsPerPacket: null,
    sowDepth: null,
    light: "Bright, indirect light",
    germDaysMin: null,
    germDaysMax: null,
    height: '12"–24"',
    spread: null,
    spacing: null,
    soil: "Cactus / succulent mix",
    watering: "Deeply, then let the soil dry out completely",
    waterEveryDays: 14,
    harvestDaysMin: null,
    harvestDaysMax: null,
    uses: "Soothing gel for minor burns",
    packetText: null,
    tips: ["Water deeply but rarely; overwatering is the #1 killer.", "Harvest outer leaves only from mature plants."],
    milestones: [],
    hasPacketImages: false,
  },
];

export type TraySeed = {
  key: string;
  name: string;
  kind: string;
  rows: string[];
  cols: number;
  notes: string;
  photo: string | null;
};

export const TRAYS: TraySeed[] = [
  {
    key: "seed-tray",
    name: "Seed tray",
    kind: "16-cell seed tray with humidity dome",
    rows: ["A", "B", "C", "D"],
    cols: 4,
    notes: "Cells are labelled column number + row letter, as printed on the tray (1A is top-left).",
    photo: "tray-seed-tray",
  },
  {
    key: "egg-carton",
    name: "Egg carton",
    kind: "18-cup egg carton on foil",
    rows: ["A", "B", "C"],
    cols: 6,
    notes: "Second planter — filled with soil, about to be planted. Cups use the same column + row labelling (1A is top-left).",
    photo: "tray-egg-carton",
  },
];

export type PlantingSeed = {
  tray: string;
  cells: string[];
  species: string;
  status: PlantingStatus;
  sprouted: boolean;
  photo: string | null;
  note?: string;
};

// From the handwritten "Herb Garden" list. Sage replaced marjoram in 4B.
export const PLANTINGS: PlantingSeed[] = [
  { tray: "seed-tray", cells: ["1A"], species: "rosemary", status: "sown", sprouted: false, photo: "cell-1A" },
  { tray: "seed-tray", cells: ["2A"], species: "thyme", status: "sprouted", sprouted: true, photo: "cell-2A", note: "Lots of tiny seedlings up in the Oct 14 photo." },
  { tray: "seed-tray", cells: ["3A"], species: "dill", status: "sown", sprouted: false, photo: "cell-3A" },
  { tray: "seed-tray", cells: ["4A"], species: "basil", status: "sprouted", sprouted: true, photo: "cell-4A", note: "First seedling just breaking the surface in the Oct 14 photo." },
  { tray: "seed-tray", cells: ["1B"], species: "oregano", status: "sprouted", sprouted: true, photo: "cell-1B", note: "One seedling up in the Oct 14 photo." },
  { tray: "seed-tray", cells: ["2B"], species: "cilantro", status: "sown", sprouted: false, photo: "cell-2B" },
  { tray: "seed-tray", cells: ["3B"], species: "parsley", status: "sown", sprouted: false, photo: "cell-3B" },
  { tray: "seed-tray", cells: ["4B"], species: "sage", status: "sown", sprouted: false, photo: "cell-4B", note: "Swapped in for marjoram (crossed off the plan)." },
  { tray: "seed-tray", cells: ["1C", "2C"], species: "lavender", status: "sown", sprouted: false, photo: "cell-1-2C" },
  { tray: "seed-tray", cells: ["3C", "4C"], species: "mint", status: "planned", sprouted: false, photo: null, note: "Mint seeds coming soon." },
  { tray: "seed-tray", cells: ["1D"], species: "cauliflower", status: "sown", sprouted: false, photo: "cell-1D" },
  { tray: "seed-tray", cells: ["2D"], species: "broccoli", status: "sprouted", sprouted: true, photo: "cell-2D", note: "One seedling up in the Oct 14 photo." },
  { tray: "seed-tray", cells: ["3D"], species: "bunching-onion", status: "sown", sprouted: false, photo: "cell-3D" },
  { tray: "seed-tray", cells: ["4D"], species: "lettuce", status: "sprouted", sprouted: true, photo: "cell-4D", note: "Lots of seedlings up in the Oct 14 photo, but they look leggy (long thin stems) — probably want more light." },
];

/** The sow date wasn't written down; estimated from how far along the seedlings were on Oct 14. */
export const ESTIMATED_SOW_DATE = "2026-10-05";
export const PHOTO_DATE = "2026-10-14";
