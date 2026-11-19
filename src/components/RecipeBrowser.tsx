import { useMemo, useState } from 'preact/hooks';
import content from '../generated/content.json';
import { type IngredientInfo, type Recipe, type RecipeFacts, type RecipeIngredient, collectionOf } from '../lib/nutrition';

// Milestone 2: a simple library browser so the recipes and their calculated
// nutrition can be checked. The full Recipes screen comes in milestone 4.

type FullRecipe = Recipe & { facts: RecipeFacts };
const INGREDIENTS = content.ingredients as unknown as Record<string, IngredientInfo>;
const RECIPES = content.recipes as unknown as FullRecipe[];

const GROUPS = [
  { id: 'all', label: 'All' },
  { id: 'main', label: 'Lunch & dinner' },
  { id: 'quick', label: 'Quick' },
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'dessert', label: 'Desserts' },
  { id: 'batch-snack', label: 'Snacks' },
] as const;
type GroupId = (typeof GROUPS)[number]['id'];

const PAGE = 30;
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

export function RecipeBrowser() {
  const [group, setGroup] = useState<GroupId>('all');
  const [veggie, setVeggie] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const list = useMemo(() => {
    const q = fold(query.trim());
    return RECIPES.filter((r) => {
      if (group !== 'all' && collectionOf(r) !== group) return false;
      if (veggie && !['vegan', 'vegetarian'].includes(r.facts.diet)) return false;
      if (!q) return true;
      const names = r.ingredients.map((i) => INGREDIENTS[i.id]?.name ?? i.id).join(' ');
      return fold(`${r.title} ${r.description} ${names} ${r.cuisine}`).includes(q);
    });
  }, [group, veggie, query]);

  return (
    <section class="card">
      <h2>Recipe library</h2>
      <p class="sub">
        {RECIPES.length} recipes. Nutrition per serving is calculated from the ingredient list.
      </p>
      <div class="chips" role="group" aria-label="Recipe group">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            class="chip"
            aria-pressed={group === g.id}
            onClick={() => {
              setGroup(g.id);
              setLimit(PAGE);
            }}
          >
            {g.label}
          </button>
        ))}
        <button class="chip" aria-pressed={veggie} onClick={() => setVeggie(!veggie)}>
          Vegetarian
        </button>
      </div>
      <input
        class="field"
        type="search"
        placeholder="Search recipes or ingredients"
        value={query}
        onInput={(e) => {
          setQuery((e.target as HTMLInputElement).value);
          setLimit(PAGE);
        }}
        aria-label="Search recipes or ingredients"
      />
      <p class="sub" style={{ marginTop: '10px' }}>
        {list.length} {list.length === 1 ? 'recipe' : 'recipes'}
      </p>
      <ul class="recipe-list">
        {list.slice(0, limit).map((r) => (
          <li key={r.id}>
            <button class="recipe-row" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
              <span class="recipe-art" aria-hidden="true">
                {r.illustration}
              </span>
              <span class="recipe-main">
                <span class="recipe-title">{r.title}</span>
                <span class="recipe-meta">
                  {r.facts.totalMinutes} min · {r.facts.perServing.kcal} kcal · {r.facts.perServing.protein} g protein
                </span>
              </span>
              <DietBadge diet={r.facts.diet} />
            </button>
            {open === r.id && <RecipeDetail recipe={r} />}
          </li>
        ))}
      </ul>
      {list.length > limit && (
        <button class="link-btn" onClick={() => setLimit(limit + PAGE)}>
          Show more ({list.length - limit} left)
        </button>
      )}
      {!list.length && <p class="empty">No recipe matches. Try another word.</p>}
    </section>
  );
}

function DietBadge({ diet }: { diet: string }) {
  if (diet === 'vegan') return <span class="badge sale">Vegan</span>;
  if (diet === 'vegetarian') return <span class="badge veg">Veggie</span>;
  return null;
}

function amount(ri: RecipeIngredient, ing: IngredientInfo | undefined): string {
  const q = ri.quantity.toLocaleString('hr-HR', { maximumFractionDigits: 2 });
  const name = ing?.name ?? ri.id;
  switch (ri.unit) {
    case 'g':
      return ri.quantity >= 1000 ? `${(ri.quantity / 1000).toLocaleString('hr-HR')} kg ${name}` : `${q} g ${name}`;
    case 'ml':
      return ri.quantity >= 1000 ? `${(ri.quantity / 1000).toLocaleString('hr-HR')} l ${name}` : `${q} ml ${name}`;
    case 'piece':
      return `${q} × ${name}`;
    default:
      return `${q} ${ri.unit} ${name}`;
  }
}

const NUTRI: [keyof RecipeFacts['perServing'], string, string][] = [
  ['kcal', 'Energy', 'kcal'],
  ['protein', 'Protein', 'g'],
  ['carbs', 'Carbohydrates', 'g'],
  ['sugar', 'of which sugars', 'g'],
  ['fat', 'Fat', 'g'],
  ['sat_fat', 'of which saturated', 'g'],
  ['fibre', 'Fibre', 'g'],
  ['salt', 'Salt', 'g'],
  ['vegPortions', 'Veg and fruit portions', ''],
];

function RecipeDetail({ recipe: r }: { recipe: FullRecipe }) {
  return (
    <div class="recipe-detail">
      <p>{r.description}</p>
      <p class="sub">
        Serves {r.servings} · prep {r.prepMinutes} min · cook {r.cookMinutes} min · {r.difficulty}
        {r.keepsDays > 0 ? ` · keeps ${r.keepsDays} ${r.keepsDays === 1 ? 'day' : 'days'}` : ''}
      </p>
      <h3>Ingredients</h3>
      <ul class="ing-list">
        {r.ingredients.map((ri) => (
          <li key={ri.id}>
            {amount(ri, INGREDIENTS[ri.id])}
            {ri.note && <span class="muted">, {ri.note}</span>}
            {ri.optional && <span class="muted"> (optional)</span>}
          </li>
        ))}
      </ul>
      <h3>Method</h3>
      <ol class="step-list">
        {r.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <h3>Nutrition per serving</h3>
      <dl class="nutri">
        {NUTRI.map(([key, label, unit]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>
              {r.facts.perServing[key].toLocaleString('hr-HR')}
              {unit && ` ${unit}`}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
