// The app frame: loads saved data, shows onboarding the first time, then
// the screen for the current address with the tab bar.

import { useEffect, useState } from 'preact/hooks';
import { Cooking } from '../screens/Cooking';
import { DataStatus } from '../screens/DataStatus';
import { OfflineBar } from '../screens/Install';
import { Onboarding } from '../screens/Onboarding';
import { PantryScreen } from '../screens/Pantry';
import { PlanScreen } from '../screens/Plan';
import { RecipeDetail } from '../screens/RecipeDetail';
import { RecipesScreen } from '../screens/Recipes';
import { SettingsScreen } from '../screens/Settings';
import { ShoppingScreen } from '../screens/Shopping';
import { TabBar } from '../ui/kit';
import { requestPersistence } from './db';
import { loadPhotos } from './photos';
import { usePriceData } from './prices';
import { type Route as RouteInfo, useRoute } from './router';
import { isLoaded, loadData, useApp } from './state';

export function Shell() {
  const d = useApp();
  const route = useRoute();
  const [ready, setReady] = useState(isLoaded());

  useEffect(() => {
    if (!ready) void Promise.all([loadData(), loadPhotos()]).then(() => setReady(true));
    void requestPersistence();
  }, []);

  const prices = usePriceData(d.settings);

  if (!ready) return <div class="boot" aria-busy="true" />;
  return (
    <>
      <OfflineBar />
      <Route route={route} prices={prices} onboarded={d.settings.onboarded} />
    </>
  );
}

function Route({ route, prices, onboarded }: { route: RouteInfo; prices: ReturnType<typeof usePriceData>; onboarded: boolean }) {
  if (route.name === 'data') return <DataStatus />;
  if (!onboarded) return <Onboarding />;

  switch (route.name) {
    case 'recipe':
      return <RecipeDetail key={route.param} id={route.param ?? ''} mealParam={route.query.get('meal')} prices={prices} />;
    case 'cook':
      return <Cooking key={route.param} id={route.param ?? ''} mealParam={route.query.get('meal')} />;
    case 'settings':
      return <SettingsScreen section={route.param} />;
  }

  const tab = ['recipes', 'shopping', 'pantry'].includes(route.name) ? route.name : 'plan';
  return (
    <>
      {tab === 'plan' && <PlanScreen prices={prices} />}
      {tab === 'recipes' && <RecipesScreen prices={prices} />}
      {tab === 'shopping' && <ShoppingScreen prices={prices} />}
      {tab === 'pantry' && <PantryScreen />}
      <TabBar active={tab} />
    </>
  );
}
