"""Matching tests with real product names from the Croatian price files."""

from pathlib import Path

import pytest

from pantry_pipeline.ingredients import load_ingredients
from pantry_pipeline.matcher import Matcher, Offer, pack_for, pick_options

ROOT = Path(__file__).resolve().parents[2]
INGREDIENTS, SETTINGS = load_ingredients(ROOT / "data" / "ingredients.yml")
BY_ID = {i.id: i for i in INGREDIENTS}
MATCHER = Matcher(INGREDIENTS, SETTINGS)


def ids(name: str, category: str = "") -> set[str]:
    return {i.id for i in MATCHER.match(name, category)}


@pytest.mark.parametrize(
    "name, ingredient",
    [
        ("PILEĆI FILE 500 g", "chicken-breast"),
        ("Pileći file", "chicken-breast"),
        ("PILEĆA PRSA BEZ KOŽE", "chicken-breast"),
        ("Svježi pileći zabatak, cca. 500g", "chicken-legs"),
        ("JUNEĆE MLJEVENO MESO 450 g", "minced-beef"),
        ("MIJEŠANO MLJEVENO MESO 540 g", "minced-mixed"),
        ("JAJA SPAR M RAZRED 10/1", "eggs"),
        ("Jaja podni uzgoj, razred M, 10 kom.", "eggs"),
        ("MLIJEKO UHT 2,8% M.M SPAR 1 L", "milk"),
        ("MASLAC ZDENKA 250 g", "butter"),
        ("VRHNJE ZA KUHANJE Z BREGOV 1 L", "cooking-cream"),
        ("Luk crveni 2kg", "onion"),
        ("ČEŠNJAK 250 g", "garlic"),
        ("KRUMPIR S BUDGET 5 kg", "potato"),
        ("Paprika crvena rfs", "bell-pepper"),
        ("ŠPINAT 400 g", "spinach"),
        ("RIŽA S-BUDGET BASMATI 1 kg", "rice"),
        ("TJES.BARILLA SPAGHETTI 500 g", "pasta"),
        ("ZOBENE PAHULJICE FREE FR.500 g", "oats"),
        ("BRAŠNO PŠ.OŠTRO T-400 POD.1 kg", "flour"),
        ("SLANUTAK PODRAVKA LIM. 400 g", "chickpeas"),
        ("LEĆA CRVENA SPAR 500 g", "red-lentils"),
        ("ULJE MASLINOVO EXTRA DJE.0,5 L", "olive-oil"),
        ("ULJE SUNCOKRETOVO JESTIVO 1 L", "sunflower-oil"),
        ("RAJČICA PASIRANA PODRAVKA 500g", "passata"),
        ("TUNA RIO MARE MASL.ULJE 160 g", "tuna-canned"),
        ("Oslić filet", "hake"),
        ("MED VARŽAK CVJETNI 450 g", "honey"),
        ("Mandarina rfs", "mandarin"),
        ("KLEMENTINA 800 g", "mandarin"),
        ("ORAH SPAR JEZGRA 200 g", "walnuts"),
        ("ZAČ.PAPRIKA SLATKA KOTAN.45 g", "paprika-powder"),
        ("ČOK.SPAR PREM.TAMNA 72% 100 g", "dark-chocolate"),
    ],
)
def test_matches(name, ingredient):
    assert ingredient in ids(name)


@pytest.mark.parametrize(
    "name, not_ingredient",
    [
        ("MAJONEZA OD SVJ. JAJA 165 g", "eggs"),
        ("REZAČ ZA JAJA PLASTIČNI 11X8cm", "eggs"),
        ("USKRŠNJE JAJE MILKA 136 g", "eggs"),
        ("Koleda makaroni s jajima 400g", "eggs"),
        ("PILEĆA PRSA NAREZAK 100 g", "chicken-breast"),
        ("PAN.PILEĆI BATAK ZABAT.BK 3 kg", "chicken-legs"),
        ("OSVJ.PIĆE FIS JABUKA 1 L", "apple"),
        ("Pfanner jabuka 100% 2 l elopak", "apple"),
        ("VINO CHIANTI FREIXENET 0,75 L", "chia"),
        ("Maslac za usne SK10", "butter"),
        ("MASLAC OD KIKIRIKI.SPAR 350 g", "butter"),
        ("KRASTAVCI ZVIJEZDA DELIK.670 g", "cucumber"),
        ("ZAMJENSKO MLIJEKO HIPP1 600 g", "milk"),
        ("MLIJEKO ČOKOL.MEGGLE 200 ml", "milk"),
        ("KOKOSOVO MLIJEKO GO TAN 250 ml", "milk"),
        ("IND.ORAH EUROCOMPANY NESL.125 g", "walnuts"),
        ("Irski juneći but - Orah", "walnuts"),
        ("ZAČIN VEGETA MUŠ.ORAH CIJ.15 g", "walnuts"),
        ("TIKVA NARANCASTA", "orange"),
        ("Friskies pseća hrana piletina-mrkva", "carrot"),
        ("GEL TUŠ FA COCONUT MILK 400ml", "coconut-milk"),
        ("Šunkarica Gavrilović", "ham"),
        ("KUPUS KIS.REZANI 500 g", "cabbage"),
        ("RAJČ.PREMIUM DATTERINI 400 g", "dates"),
        ("ČOKOLADA NUGASSO KANDI 90 g", "dark-chocolate"),
        ("NOŽ ZA LJUŠTENJE KRUMPIRA RF", "potato"),
        ("PVC NAVLAKA ZA JAJA 12/1", "eggs"),
        ("KLC.Gnocchi bez jaja 500g", "eggs"),
        ("FA PJENA ZA KUPANJE 750ML C O CACAO BUTTER", "butter"),
        ("LEDOLE.SIR PILE.PRS.LEDO 800 g", "chicken-breast"),
    ],
)
def test_does_not_match(name, not_ingredient):
    assert not_ingredient not in ids(name)


def test_sauerkraut_goes_to_sauerkraut_not_cabbage():
    assert ids("KUPUS KIS.REZANI 500 g") == {"sauerkraut"}


def test_nonfood_category_is_skipped():
    assert ids("Vileda spužvasta krpa 10kom", "SREDSTVA ZA ČIŠĆENJE") == set()


# ---------------------------------------------------------------- package sizes


def test_pack_from_name_and_pieces():
    eggs = BY_ID["eggs"]
    assert pack_for(eggs, "JAJA SPAR M RAZRED 10/1", "", "").amount == 10


def test_pack_loose_per_kg():
    apple = BY_ID["apple"]
    pack = pack_for(apple, "Jabuka Gala rfs", "1", "kg", price=1.49, unit_price=1.49)
    assert pack.loose and pack.amount == 1000


def test_pack_kaufland_base_units():
    rice = BY_ID["rice"]
    pack = pack_for(rice, "Riža dugozrnata", "0,500", "KOM", price=1.29, unit_price=2.58)
    assert pack.amount == 500


def test_juice_is_not_a_fruit_package():
    assert pack_for(BY_ID["apple"], "Jabuka 1 L", "", "") is None


def test_piece_ingredient_sold_by_weight():
    lemon = BY_ID["lemon"]
    pack = pack_for(lemon, "LIMUN S BUDGET 500 g", "", "")
    assert pack.amount == 5  # 500 g / 100 g per lemon


# ---------------------------------------------------------------- best value options


def offer(name, amount, price, barcode=""):
    return Offer("rice", name, name, "", barcode or name, amount, False, price, None, None, None)


def test_pick_options_prefers_value_and_keeps_cheapest_pack():
    rice = BY_ID["rice"]
    offers = [
        offer("RIŽA A 1 kg", 1000, 1.99),
        offer("RIŽA B 500 g", 500, 0.89),
        offer("RIŽA C 2 kg", 2000, 3.10),
        offer("RIŽA D 250 g", 250, 0.79),
        offer("RIŽA E 1 kg", 1000, 2.49),
    ]
    picked = [o.name for o in pick_options(rice, offers, keep=2)]
    assert picked[:2] == ["RIŽA C 2 kg", "RIŽA B 500 g"]
    assert "RIŽA D 250 g" in picked  # cheapest single package is always offered


def test_pick_options_dedupes_lidl_variants():
    rice = BY_ID["rice"]
    offers = [offer("Basmati riža", 1000, 2.29, "123"), offer("Basmati riža", 1000, 2.29, "123")]
    assert len(pick_options(rice, offers)) == 1


def test_pick_options_drops_misread_sizes():
    rice = BY_ID["rice"]
    offers = [offer(f"RIŽA {i}", 1000, 2.0 + i / 10) for i in range(5)]
    offers.append(offer("RIŽA BAD", 100000, 2.0))  # 100 kg for 2 EUR is a parsing error
    assert "RIŽA BAD" not in [o.name for o in pick_options(rice, offers)]


@pytest.mark.parametrize(
    "name",
    [
        "GRAH BIJELI 400/240 g GUSTO SANO",
        "GRAH BIJELI 230g LIM PODRAVKA",
        "Bijeli grah, OM 240g",
        "GRAH BIJELI NA PARI 310/250g BONDUELLE",
        "LEĆA LIM.400g PODRAVKA",
        "LEĆA DESPAR KUHANA 400 g",
        "KLC.Leća smeđa 400 g/260 g",
        "GRAH BIJELI CANNELLINI GARDEN GOOD 240g",
    ],
)
def test_tins_are_not_dried_beans_or_lentils(name):
    assert not ids(name) & {"white-beans", "lentils", "red-lentils", "chickpeas-dry"}


@pytest.mark.parametrize(
    "name, ingredient",
    [
        ("GRAH BIJELI", "white-beans"),
        ("GRAH GARDEN GOOD BIJELI 500g", "white-beans"),
        ("LEĆA ZELENA VEDRINI 500 g", "lentils"),
        ("LEĆA CRVENA SPAR 500 g", "red-lentils"),
        ("SLANUTAK SPAR 500 g", "chickpeas-dry"),
    ],
)
def test_dried_packs_still_match(name, ingredient):
    assert ingredient in ids(name)


def test_dried_chickpeas_are_not_also_canned():
    assert ids("SLANUTAK SPAR 500 g") == {"chickpeas-dry"}


def test_cannellini_tin_is_canned_beans():
    assert "kidney-beans" in ids("GRAH BIJELI CANNELLINI GARDEN GOOD 240g")


@pytest.mark.parametrize(
    "name, expected",
    [
        ("KLC.Prašak za puding od vanilije 37g", {"pudding-powder"}),
        ("SD.KLC.Puding od slatk.vrh.vanil. 500g", set()),
        ("RAHAT LOKUM ORAH 180g ADRIA", set()),
        ("PAŠTETA PILEĆA S AJVAROM 95g PODRAVKA", set()),
        ("SPECIAL DOG EX. MP SVJ TUNA 150g", set()),
        ("Curry zalogaj SK1", set()),
        ("KRAFNA KAKAO 60g", set()),
        ("Nu Bake Baklava orah 500 g", set()),
        ("Carnex Hummus sa ajvarom 95 g", {"hummus"}),
        ("Kakao UTZ", {"cocoa"}),
        ("LECA 400 G CAMPO", set()),
        ("Hamburger/Hot Dog peciva SK14", {"bread-rolls"}),
        ("AJVAR BLAGI 700g ZVIJEZDA", {"ajvar"}),
        ("SOFTY LIMUN RUCNICI 2 KOM 2 SL. 98 LISTICA", set()),
        ("Limun 500g mrežica", {"lemon"}),
        ("SOK TOCO LIMUN- KRASTAVAC 1,5 L", set()),
        ("LIMUNOV SOK 200 ML LIVE", {"lemon-juice"}),
        ("ŽV GUMA AIRWAVES GINGER LIME 14g", set()),
        ("DJUMBIR USECERENI 125 G VEDRINI", set()),
        ("Bio đumbir", {"ginger"}),
        ("PERSIN USITNJEN 10 G FINO VRECICA", set()),
        ("PERŠIN LIST 100 grama", {"parsley"}),
        ("BUNDEVINE GOLICE 200 G EKOZONA", set()),
        ("Hokkaido tikva", {"pumpkin"}),
        ("SOK ISO SPORT LIMUN GREJP 1,5 L", set()),
        ("ĐUMBIR SUHI EUROCOMPANY 80g", set()),
        ("Aleva Peršin list 7g", set()),
        ("ĐUMBIR LISTIĆI NATURA 125g", set()),
        ("Kozice u hrskavom tijestu SK1", set()),
        ("KLC Repovi kozica smrznuti 225 g", {"shrimp"}),
    ],
)
def test_ready_made_and_non_food_are_left_out(name, expected):
    assert ids(name) == expected


def test_tiny_pack_of_a_piece_ingredient_is_skipped():
    # 5 g of something counted in 200 g pieces rounds to 0 pieces; it used to
    # crash Plodine's whole price list with a division by zero.
    avocado = BY_ID["avocado"]
    assert pack_for(avocado, "AVOKADO ULJE ARoma 5 g", "", "") is None
