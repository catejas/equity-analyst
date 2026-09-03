/* segments.js — a navigation aid, not a registry.
 *
 * This is a taxonomy of where Indian listed companies actually sit, written to
 * make the segment box quick to use on a phone. It is deliberately not a
 * classification standard and it is not exhaustive: the input stays free text,
 * so anything missing can still be typed. Nothing downstream branches on these
 * strings — they are passed to the prompt as written.
 */
(function (window) {
  'use strict';

  var SEGMENTS = [
    ['Banking', ['Public sector banks', 'Private sector banks', 'Small finance banks',
      'Payments banks', 'Regional and rural banks', 'Foreign bank subsidiaries']],

    ['Non-banking finance', ['Housing finance', 'Vehicle finance', 'Gold loans',
      'Microfinance', 'Consumer and personal loans', 'Loan against property',
      'SME and business lending', 'Infrastructure finance', 'Education loans',
      'Wholesale and structured credit', 'Asset reconstruction']],

    ['Insurance', ['Life insurance', 'General insurance', 'Health insurance',
      'Reinsurance', 'Insurance broking and distribution']],

    ['Capital markets', ['Asset management', 'Broking and distribution',
      'Wealth management', 'Exchanges and depositories', 'Rating agencies',
      'Registrars and transfer agents', 'Investment banking']],

    ['Fintech and payments', ['Payment gateways and aggregators', 'Card networks and issuing',
      'Digital lending platforms', 'Banking technology', 'Insurtech',
      'Account aggregators', 'ATM and cash management']],

    ['Information technology', ['IT services', 'Engineering research and development',
      'Business process management', 'Product engineering', 'Enterprise software',
      'Software as a service', 'Data centres and cloud infrastructure',
      'Cybersecurity', 'Artificial intelligence and analytics', 'IT staffing']],

    ['Pharmaceuticals', ['Domestic formulations', 'US generics', 'Emerging market formulations',
      'Active pharmaceutical ingredients', 'Contract research and manufacturing',
      'Specialty and complex generics', 'Biosimilars', 'Vaccines',
      'Animal health', 'Over the counter and consumer health']],

    ['Healthcare services', ['Hospitals', 'Diagnostics and pathology laboratories',
      'Medical devices and equipment', 'Health insurance third-party administration',
      'Telemedicine and digital health', 'Eye care and single-specialty chains',
      'Fertility and maternity care', 'Pharmacy retail']],

    ['Chemicals', ['Specialty chemicals', 'Agrochemicals and crop protection',
      'Commodity and bulk chemicals', 'Petrochemicals', 'Dyes and pigments',
      'Fluorochemicals', 'Surfactants and oleochemicals', 'Flavours and fragrances',
      'Contract development and manufacturing', 'Industrial gases',
      'Adhesives and sealants', 'Paints and coatings']],

    ['Fertilisers', ['Urea', 'Complex fertilisers', 'Phosphatic and potassic',
      'Micronutrients and speciality nutrition', 'Bio-fertilisers']],

    ['Automobiles', ['Passenger vehicles', 'Two wheelers', 'Three wheelers',
      'Commercial vehicles', 'Tractors and farm equipment', 'Construction equipment',
      'Electric vehicles', 'Luxury and premium vehicles']],

    ['Auto components', ['Powertrain and engine parts', 'Transmission and driveline',
      'Braking systems', 'Suspension and chassis', 'Electricals and electronics',
      'Interiors and seating', 'Tyres', 'Batteries and energy storage',
      'EV components and traction motors', 'Castings and forgings',
      'Bearings', 'Aftermarket and replacement']],

    ['Capital goods', ['Industrial machinery', 'Electrical equipment',
      'Transformers and switchgear', 'Cables and wires', 'Pumps and compressors',
      'Bearings and transmission', 'Process equipment', 'Material handling',
      'Machine tools', 'Automation and robotics', 'Boilers and turbines']],

    ['Defence and aerospace', ['Shipbuilding', 'Aerospace structures and components',
      'Avionics and electronic warfare', 'Ammunition and explosives',
      'Missiles and guided systems', 'Land systems and armoured vehicles',
      'Radars and sensors', 'Drones and unmanned systems',
      'Maintenance repair and overhaul', 'Space and satellite systems',
      'Defence electronics and communications']],

    ['Railways', ['Rolling stock and coaches', 'Wagons and freight',
      'Signalling and telecom', 'Track and infrastructure', 'Locomotives',
      'Station development', 'Metro and urban rail']],

    ['Infrastructure and construction', ['Roads and highways', 'Urban infrastructure',
      'Water and irrigation', 'Ports and terminals', 'Airports',
      'Power transmission EPC', 'Industrial and civil construction',
      'Tunnelling and metros', 'Smart cities and utilities']],

    ['Real estate', ['Residential development', 'Commercial office',
      'Retail malls', 'Warehousing and logistics parks', 'Real estate investment trusts',
      'Plotted development', 'Hospitality assets', 'Data centre real estate',
      'Property management and services']],

    ['Cement and building materials', ['Cement', 'Ready-mix concrete', 'Tiles and sanitaryware',
      'Plywood and laminates', 'Glass', 'Pipes and fittings', 'Bricks and blocks',
      'Paints and decoratives', 'Modular kitchens and furniture']],

    ['Metals and mining', ['Steel', 'Aluminium', 'Copper', 'Zinc and lead',
      'Iron ore mining', 'Coal mining', 'Ferro alloys', 'Sponge iron',
      'Stainless steel', 'Pipes and tubes', 'Precious metals', 'Rare earths']],

    ['Oil and gas', ['Upstream exploration and production', 'Refining',
      'Marketing and retailing', 'City gas distribution', 'Gas transmission',
      'Liquefied natural gas', 'Oilfield services', 'Lubricants',
      'Petrochemical integration']],

    ['Power and utilities', ['Thermal generation', 'Hydro generation',
      'Nuclear generation', 'Renewable generation', 'Transmission',
      'Distribution', 'Power trading', 'Energy storage and grid services',
      'Water utilities', 'Waste management']],

    ['Renewable energy', ['Solar power generation', 'Solar module and cell manufacturing',
      'Wind power generation', 'Wind equipment manufacturing', 'Green hydrogen',
      'Biofuels and ethanol', 'Battery manufacturing', 'Electrolysers',
      'Waste to energy', 'Renewable EPC']],

    ['Fast moving consumer goods', ['Packaged foods', 'Beverages',
      'Dairy', 'Personal care', 'Home care', 'Tobacco',
      'Edible oils', 'Staples and commodities', 'Ayurveda and naturals',
      'Confectionery and snacks', 'Nutraceuticals']],

    ['Consumer durables', ['Air conditioners and cooling', 'Kitchen appliances',
      'Consumer electronics', 'Lighting', 'Fans', 'Small appliances',
      'Wires and switches', 'Water purification', 'Furniture']],

    ['Electronics manufacturing', ['Contract manufacturing', 'Printed circuit boards',
      'Semiconductors and assembly', 'Display and optics', 'Connectors and passives',
      'Mobile handset assembly', 'Wearables and hearables', 'LED and lighting components']],

    ['Retail', ['Apparel and lifestyle retail', 'Grocery and supermarkets',
      'Electronics retail', 'Jewellery retail', 'Footwear',
      'Quick commerce', 'Online marketplaces', 'Speciality retail',
      'Cash and carry', 'Departmental stores']],

    ['Textiles and apparel', ['Cotton yarn and spinning', 'Fabrics and weaving',
      'Readymade garments', 'Home textiles', 'Technical textiles',
      'Man-made fibre', 'Denim', 'Dyeing and processing', 'Apparel exports']],

    ['Agriculture and agri inputs', ['Seeds', 'Crop protection', 'Farm mechanisation',
      'Agri commodities and trading', 'Sugar', 'Plantations and tea',
      'Aquaculture and seafood', 'Poultry and animal feed', 'Food processing',
      'Cold chain and agri logistics']],

    ['Logistics and transport', ['Third party logistics', 'Express and courier',
      'Warehousing', 'Shipping and marine', 'Port operations',
      'Air cargo', 'Rail freight', 'Container and rail terminals',
      'Trucking and road freight', 'Supply chain technology']],

    ['Aviation', ['Airlines', 'Airport operations', 'Ground handling',
      'Aircraft leasing', 'Maintenance repair and overhaul', 'Air cargo carriers']],

    ['Hospitality and tourism', ['Hotels', 'Restaurants and quick service',
      'Travel agencies and online travel', 'Resorts and leisure',
      'Wedding and event venues', 'Cruise and experiences']],

    ['Media and entertainment', ['Broadcasting', 'Film production and distribution',
      'Streaming platforms', 'Music and audio', 'Print media',
      'Advertising and marketing services', 'Exhibition and multiplexes',
      'Gaming and esports', 'Animation and visual effects']],

    ['Telecommunications', ['Wireless services', 'Fixed line and broadband',
      'Telecom towers and infrastructure', 'Optical fibre',
      'Telecom equipment', 'Satellite communications', 'Enterprise connectivity']],

    ['Education', ['Schools and K-12', 'Higher education',
      'Test preparation and coaching', 'Online learning', 'Vocational and skilling',
      'Education infrastructure and services']],

    ['Paper and packaging', ['Writing and printing paper', 'Packaging board',
      'Corrugated packaging', 'Flexible packaging', 'Rigid plastics',
      'Glass containers', 'Metal packaging', 'Labels and printing',
      'Sustainable and recycled packaging']],

    ['Engineering and industrial services', ['Engineering consultancy',
      'Project management', 'Industrial maintenance', 'Testing and certification',
      'Facility management', 'Environmental services']],

    ['Trading and distribution', ['Industrial distribution', 'Chemical distribution',
      'Pharmaceutical distribution', 'Commodity trading', 'Electronics distribution']],

    ['Diversified holdings', ['Holding companies', 'Conglomerates',
      'Investment companies', 'Family holding structures']],

    ['Shipping and marine', ['Dry bulk shipping', 'Tanker shipping',
      'Container shipping', 'Offshore support vessels', 'Dredging',
      'Ship repair and building', 'Inland waterways']],

    ['Water and environment', ['Water treatment', 'Desalination',
      'Wastewater and sewage', 'Solid waste management', 'Recycling',
      'Pollution control equipment', 'Carbon and emissions services']],

    ['Emerging themes', ['China plus one beneficiaries',
      'Import substitution and localisation', 'Production linked incentive beneficiaries',
      'Energy transition value chain', 'Electric vehicle value chain',
      'Semiconductor value chain', 'Defence indigenisation',
      'Railway capital expenditure cycle', 'Data centre value chain',
      'Premiumisation and consumption upgrade', 'Rural recovery',
      'Formalisation of the economy', 'Capital expenditure cycle revival',
      'Export manufacturing', 'Digital public infrastructure']]
  ];

  /* Flat searchable index. Each entry is either a segment or a
     segment-and-subsegment pair, so one search box serves both. */
  var INDEX = [];
  SEGMENTS.forEach(function (row) {
    var seg = row[0], subs = row[1] || [];
    INDEX.push({ segment: seg, sub: '', label: seg, kind: 'segment', subCount: subs.length });
    subs.forEach(function (sub) {
      INDEX.push({ segment: seg, sub: sub, label: sub, kind: 'sub' });
    });
  });

  /* Match on word starts as well as substrings, so "elec war" finds
     "Avionics and electronic warfare" and "def" finds the segment before any
     of its subsegments. Ranking: segment before subsegment, prefix before
     word-start before substring, then alphabetical. */
  function search(q, limit) {
    q = String(q || '').trim().toLowerCase();
    limit = limit || 60;
    if (!q) {
      return INDEX.filter(function (x) { return x.kind === 'segment'; }).slice(0, limit);
    }
    var terms = q.split(/\s+/).filter(Boolean);
    var out = [];
    INDEX.forEach(function (x) {
      var hay = (x.segment + ' ' + x.sub).toLowerCase();
      var ok = terms.every(function (t) { return hay.indexOf(t) !== -1; });
      if (!ok) return;
      var lab = x.label.toLowerCase();
      var rank = 3;
      if (lab.indexOf(q) === 0) rank = 0;
      else if (new RegExp('\\b' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(lab)) rank = 1;
      else if (lab.indexOf(q) !== -1) rank = 2;
      out.push({ item: x, rank: rank + (x.kind === 'segment' ? 0 : 0.5) });
    });
    out.sort(function (a, b) {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.item.label.localeCompare(b.item.label);
    });
    return out.slice(0, limit).map(function (r) { return r.item; });
  }

  function subsOf(segment) {
    var s = String(segment || '').trim().toLowerCase();
    for (var i = 0; i < SEGMENTS.length; i++) {
      if (SEGMENTS[i][0].toLowerCase() === s) return SEGMENTS[i][1].slice();
    }
    return [];
  }

  window.EQSegments = {
    all: SEGMENTS,
    index: INDEX,
    search: search,
    subsOf: subsOf,
    count: { segments: SEGMENTS.length, entries: INDEX.length }
  };
})(window);
