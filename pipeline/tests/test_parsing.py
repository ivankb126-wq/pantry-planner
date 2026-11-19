import pytest

from pantry_pipeline.parsing import Size, fold, parse_decimal, size_from_fields, size_from_name, tokens


def test_fold_removes_diacritics():
    assert fold("Pileći file šunka ŽUTI Đ") == "PILECI FILE SUNKA ZUTI DJ"


def test_tokens_split_abbreviations():
    assert tokens("MAJONEZA OD SVJ.JAJA 165 g") == ["MAJONEZA", "OD", "SVJ", "JAJA", "165", "G"]


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("1,99", 1.99),
        ("1.99", 1.99),
        (" 1 234,50 ", 1234.5),
        ("1.234,50", 1234.5),
        ("", None),
        (None, None),
        ("abc", None),
    ],
)
def test_parse_decimal(raw, expected):
    assert parse_decimal(raw) == expected


@pytest.mark.parametrize(
    "name, expected",
    [
        ("PILEĆI FILE 500 g", Size(500, "mass")),
        ("MLIJEKO UHT 2,8% M.M SPAR 1 L", Size(1000, "volume")),
        ("VODA JAMNICA GAZIRANA 0,5 L PET", Size(500, "volume")),
        ("Jogurt Activia 4x125g", Size(500, "mass")),
        ("RAJČICA DESPAR PELAT 3X400 g", Size(1200, "mass")),
        ("JAJA SPAR M RAZRED 10/1", Size(10, "count")),
        ("Jaja podni uzgoj, razred M, 10 kom.", Size(10, "count")),
        ("KRASTAVCI ZVIJEZDA DELIK.670 g", Size(670, "mass")),
        ("BRAŠNO PŠ.OŠTRO T-400 POD.1 kg", Size(1000, "mass")),
        ("Krušne mrvice, 500g", Size(500, "mass")),
        ("Pileći file", None),
    ],
)
def test_size_from_name(name, expected):
    assert size_from_name(name) == expected


@pytest.mark.parametrize(
    "quantity, unit, expected",
    [
        ("0,2500", "L", Size(250, "volume")),  # Spar
        ("0,0400", "kg", Size(40, "mass")),  # Spar
        ("16,0000", "kom", Size(16, "count")),  # Spar
        ("0.34", "g (1kg)", Size(340, "mass")),  # Lidl
        ("1.5", "ml (1 L)", Size(1500, "volume")),  # Lidl
        ("0,460", "KOM", Size(460, "base")),  # Kaufland
        ("0.20 kg", "ko", Size(200, "mass")),  # Konzum
        ("0,500 L", "KOM", Size(500, "volume")),  # Plodine
        ("1", "kom", Size(1, "count")),
        ("", "kg", None),
    ],
)
def test_size_from_fields(quantity, unit, expected):
    assert size_from_fields(quantity, unit) == expected
