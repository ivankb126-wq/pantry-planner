// "I don't have X": what can stand in for an ingredient, and how much.
// `ratio` is how much of the swap (in its own unit, see data/ingredients.yml)
// replaces one unit of the original: 1 lemon (piece) -> 40 ml lemon juice.
// Keep this file free of imports so the planner can use it.

export interface Swap {
  id: string;
  ratio: number;
  note?: string;
}

const s = (id: string, ratio = 1, note?: string): Swap => ({ id, ratio, note });

export const SUBSTITUTES: Record<string, Swap[]> = {
  // Meat and fish
  'chicken-breast': [s('turkey-breast'), s('pork-loin')],
  'turkey-breast': [s('chicken-breast'), s('pork-loin')],
  'chicken-legs': [s('chicken-breast', 0.7, 'no bones: cook it for less time')],
  'minced-beef': [s('minced-mixed'), s('pork-mince'), s('turkey-mince')],
  'minced-mixed': [s('minced-beef'), s('pork-mince'), s('turkey-mince')],
  'pork-mince': [s('minced-mixed'), s('minced-beef'), s('turkey-mince')],
  'turkey-mince': [s('minced-mixed'), s('minced-beef'), s('pork-mince')],
  'pork-loin': [s('pork-neck', 1, 'juicier, give it a few minutes more'), s('chicken-breast'), s('turkey-breast')],
  'pork-neck': [s('pork-loin', 1, 'leaner: cook it for less time')],
  beef: [s('veal'), s('lamb')],
  bacon: [s('ham'), s('prosciutto', 0.8)],
  ham: [s('bacon'), s('prosciutto')],
  prosciutto: [s('ham'), s('bacon')],
  'smoked-ribs': [s('bacon', 0.5, 'it is all meat, so less')],
  hake: [s('cod'), s('trout', 1, 'fillets')],
  cod: [s('hake')],
  salmon: [s('trout')],
  trout: [s('salmon'), s('sea-bream')],
  'sea-bream': [s('trout')],
  shrimp: [s('squid')],
  squid: [s('shrimp')],
  'tuna-canned': [s('sardines-canned'), s('mackerel-canned')],
  anchovies: [s('capers', 1, 'for the salty kick'), s('olives')],

  // Dairy
  milk: [s('oat-drink'), s('soy-drink'), s('almond-drink')],
  'oat-drink': [s('milk'), s('soy-drink')],
  yogurt: [s('greek-yogurt', 1, 'thicker'), s('kefir'), s('sour-cream')],
  'greek-yogurt': [s('yogurt', 1, 'thinner: drain it in a sieve if you can'), s('sour-cream')],
  'sour-cream': [s('greek-yogurt'), s('yogurt'), s('cooking-cream')],
  'cooking-cream': [s('whipping-cream'), s('sour-cream', 1, 'stir it in at the end, do not boil'), s('milk', 1, 'thinner: add a knob of butter')],
  'whipping-cream': [s('cooking-cream', 1, 'for cooking only, it will not whip')],
  butter: [s('sunflower-oil', 0.8, 'fine for frying and most cakes'), s('olive-oil', 0.8, 'for frying, not for baking')],
  parmesan: [s('hard-cheese')],
  'hard-cheese': [s('parmesan'), s('cheddar')],
  cheddar: [s('hard-cheese')],
  mozzarella: [s('hard-cheese')],
  feta: [s('sheep-cheese'), s('goat-cheese'), s('cottage-cheese', 1, 'milder: add a pinch of salt')],
  'cottage-cheese': [s('ricotta'), s('cream-cheese')],
  ricotta: [s('cottage-cheese'), s('cream-cheese'), s('mascarpone')],
  'cream-cheese': [s('mascarpone'), s('ricotta')],
  mascarpone: [s('cream-cheese')],
  kefir: [s('yogurt')],
  'coconut-milk': [s('cooking-cream')],
  'coconut-cream': [s('coconut-milk', 1.5)],

  // Vegetables and fruit
  onion: [s('leek', 1.2, 'the white part'), s('spring-onion')],
  leek: [s('onion', 0.8)],
  'spring-onion': [s('onion', 0.5, 'a little, chopped very finely'), s('leek')],
  garlic: [s('garlic-powder', 0.15)],
  ginger: [s('ground-ginger', 0.15)],
  'chili-pepper': [s('chili-flakes', 0.1)],
  tomato: [s('canned-tomatoes', 1, 'for cooking, not for salad')],
  'canned-tomatoes': [s('passata'), s('tomato', 1.2)],
  passata: [s('canned-tomatoes', 1, 'blend it if you want it smooth')],
  'tomato-paste': [s('passata', 3, 'cook it down a few minutes longer')],
  spinach: [s('swiss-chard'), s('kale')],
  'swiss-chard': [s('spinach'), s('kale')],
  kale: [s('spinach'), s('swiss-chard')],
  zucchini: [s('eggplant')],
  eggplant: [s('zucchini')],
  'bell-pepper': [s('roasted-peppers', 1, 'add them near the end')],
  'roasted-peppers': [s('bell-pepper')],
  broccoli: [s('cauliflower')],
  cauliflower: [s('broccoli')],
  'green-beans': [s('peas'), s('broccoli')],
  peas: [s('green-beans'), s('edamame')],
  potato: [s('sweet-potato')],
  'sweet-potato': [s('potato'), s('pumpkin')],
  pumpkin: [s('sweet-potato')],
  carrot: [s('parsnip')],
  parsnip: [s('carrot')],
  celeriac: [s('parsnip'), s('carrot')],
  mushrooms: [s('dried-porcini', 0.1, 'soak them in hot water for 20 minutes')],
  lettuce: [s('spinach', 1, 'young leaves')],
  lemon: [s('lemon-juice', 40, 'juice only, no zest'), s('vinegar', 15, 'a splash')],
  'lemon-juice': [s('lemon', 1 / 40), s('vinegar', 0.5)],
  apple: [s('pear')],
  pear: [s('apple')],
  parsley: [s('dill')],
  dill: [s('parsley')],

  // Grains, bread and baking
  rice: [s('bulgur'), s('quinoa'), s('couscous')],
  'risotto-rice': [s('rice', 1, 'a little less creamy')],
  couscous: [s('bulgur'), s('quinoa'), s('rice')],
  bulgur: [s('couscous'), s('quinoa')],
  quinoa: [s('bulgur'), s('couscous')],
  noodles: [s('pasta', 1, 'spaghetti works')],
  oats: [s('muesli')],
  breadcrumbs: [s('oats'), s('cornflakes', 1, 'crushed'), s('bread', 1.5, 'stale, blitzed or grated')],
  flour: [s('wholemeal-flour', 1, 'a little heavier')],
  'wholemeal-flour': [s('flour')],
  cornstarch: [s('flour', 2, 'cook it a minute longer')],
  sugar: [s('honey', 0.8), s('powdered-sugar')],
  'powdered-sugar': [s('sugar', 1, 'blitz it fine first')],
  'vanilla-sugar': [s('sugar')],
  honey: [s('maple-syrup'), s('sugar', 1.2)],
  'maple-syrup': [s('honey')],
  'baking-soda': [s('baking-powder', 3)],
  'baking-powder': [s('baking-soda', 0.3, 'only with yogurt or lemon in the dough')],
  'dry-yeast': [s('fresh-yeast', 3)],
  'fresh-yeast': [s('dry-yeast', 1 / 3)],
  bread: [s('bread-rolls', 1 / 60)],
  tortillas: [s('flatbread', 1 / 90)],
  flatbread: [s('tortillas', 90)],
  'filo-pastry': [s('puff-pastry', 1, 'richer and puffier')],

  // Beans and lentils
  chickpeas: [s('white-beans'), s('kidney-beans'), s('black-beans')],
  'white-beans': [s('chickpeas'), s('kidney-beans')],
  'kidney-beans': [s('black-beans'), s('white-beans')],
  'black-beans': [s('kidney-beans'), s('white-beans')],
  lentils: [s('red-lentils', 1, 'they go soft')],
  'red-lentils': [s('lentils', 1, 'cook them longer')],

  // Oils, nuts and seeds
  'olive-oil': [s('sunflower-oil')],
  'sunflower-oil': [s('olive-oil')],
  'sesame-oil': [s('sunflower-oil', 1, 'plus a few sesame seeds')],
  'pumpkin-seed-oil': [s('olive-oil')],
  lard: [s('sunflower-oil')],
  walnuts: [s('hazelnuts'), s('almonds')],
  hazelnuts: [s('walnuts'), s('almonds')],
  almonds: [s('hazelnuts'), s('cashews'), s('walnuts')],
  cashews: [s('peanuts'), s('almonds')],
  peanuts: [s('cashews'), s('almonds')],
  raisins: [s('dried-cranberries'), s('dates', 1, 'chopped')],
  dates: [s('prunes'), s('raisins')],
  sesame: [s('sunflower-seeds')],
  'pumpkin-seeds': [s('sunflower-seeds')],
  'sunflower-seeds': [s('pumpkin-seeds')],
  chia: [s('flaxseed')],
  'peanut-butter': [s('tahini')],
  tahini: [s('peanut-butter')],

  // Spices, herbs and sauces
  'paprika-powder': [s('chili-flakes', 0.3, 'hotter, so less')],
  'chili-flakes': [s('paprika-powder', 2)],
  cumin: [s('coriander-ground'), s('curry-powder')],
  'coriander-ground': [s('cumin')],
  'curry-powder': [s('cumin', 0.5)],
  turmeric: [s('curry-powder')],
  oregano: [s('italian-herbs'), s('thyme'), s('basil')],
  basil: [s('oregano'), s('italian-herbs')],
  thyme: [s('oregano'), s('italian-herbs')],
  rosemary: [s('thyme')],
  'italian-herbs': [s('oregano')],
  vegeta: [s('stock-cubes')],
  'stock-cubes': [s('vegeta')],
  'soy-sauce': [s('fish-sauce', 0.5)],
  'fish-sauce': [s('soy-sauce')],
  vinegar: [s('lemon-juice')],
  mustard: [s('horseradish', 0.5)],
  mayonnaise: [s('greek-yogurt')],
  'hoisin-sauce': [s('bbq-sauce')],
  'chili-sauce': [s('chili-flakes', 0.2)],
  'curry-paste': [s('curry-powder', 0.5)],
  'white-wine': [s('vinegar', 0.15, 'a splash, topped up with water')],
  'red-wine': [s('vinegar', 0.15, 'a splash, topped up with water')],
};

/** Garnishes and flavourings a dish still works without. */
const CAN_SKIP = new Set([
  'parsley', 'dill', 'spring-onion', 'chili-pepper', 'sesame', 'capers', 'olives', 'pumpkin-seeds', 'sunflower-seeds',
  'chia', 'coconut-flakes', 'dried-cranberries', 'raisins', 'sesame-oil', 'white-wine', 'red-wine', 'bay-leaves',
]);

export function canLeaveOut(id: string, category: string | undefined, optional: boolean): boolean {
  return optional || CAN_SKIP.has(id) || (category === 'spices' && id !== 'salt');
}

/** Swaps chosen for one meal: ingredient -> swap id ('' = left out). */
export type MealSubs = Record<string, string>;

export function swapRatio(from: string, to: string): number {
  return SUBSTITUTES[from]?.find((x) => x.id === to)?.ratio ?? 1;
}

/** A recipe's amounts with the meal's swaps applied (left-out food dropped). */
export function applySubs(list: { id: string; amount: number }[], subs?: MealSubs): { id: string; amount: number }[] {
  if (!subs || !Object.keys(subs).length) return list;
  const out: { id: string; amount: number }[] = [];
  for (const { id, amount } of list) {
    const to = subs[id];
    const target = to === undefined ? { id, amount } : to === '' ? null : { id: to, amount: amount * swapRatio(id, to) };
    if (!target) continue;
    const same = out.find((x) => x.id === target.id);
    if (same) same.amount += target.amount;
    else out.push(target);
  }
  return out;
}
