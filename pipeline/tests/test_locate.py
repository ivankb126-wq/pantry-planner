from pantry_pipeline.locate import add_locations, dump_locations, locate, same_street, split_address


def shop(brand, lat, lon, street="", number="", postcode=""):
    tags = {"shop": "supermarket", "brand": brand}
    if street:
        tags["addr:street"] = street
    if number:
        tags["addr:housenumber"] = number
    if postcode:
        tags["addr:postcode"] = postcode
    return {"type": "node", "lat": lat, "lon": lon, "tags": tags}


def place(name, lat, lon, kind="village"):
    return {"type": "node", "lat": lat, "lon": lon, "tags": {"name": name, "place": kind}}


def test_split_address():
    assert split_address("Ulica Kralja Zvonimira 2a") == ({"zvonimira"}, "2a")
    assert split_address("Svetog Leopolda Bogdana Mandića 33 A") == ({"leopolda", "bogdana", "mandica"}, "33a")
    assert split_address("Ulica 3. Gardijske Brigade Kune 2")[1] == "2"


def test_same_street_ignores_filler_and_short_forms():
    assert same_street(split_address("Svilajska Ulica 37")[0], split_address("Svilajska")[0])
    assert same_street(
        split_address("Sv. Leopolda B. Mandica 7")[0], split_address("Ulica svetog Leopolda Bogdana Mandića")[0]
    )
    assert not same_street(split_address("Vukovarska 27")[0], split_address("Osječka")[0])


def test_store_found_by_street_and_number():
    stores = {"lidl": [{"id": "1", "address": "Zeleno Polje 8 A", "city": "Osijek", "zip": "31000"}]}
    shops = [
        shop("Lidl", 45.553, 18.731, "Zeleno polje", "8a"),
        shop("Lidl", 45.565, 18.636, "Ulica J. J. Strossmayera", "350"),
    ]
    places = [place("Osijek", 45.555, 18.695, "city")]
    assert locate(stores, shops, places) == {"lidl:1": [45.553, 18.731, 1]}


def test_unknown_store_gets_its_town_and_the_right_village_by_postcode():
    # Two villages called Antunovac; the postcode (31...) says it is the one near Osijek.
    stores = {"konzum": [{"id": "9", "address": "Glavna 1", "city": "Antunovac", "zip": "31216"}]}
    shops = [shop("Spar", 45.55, 18.69, "Trpimira", "14", "31000")]
    places = [place("Antunovac", 45.821, 17.386), place("Antunovac", 45.491, 18.675)]
    assert locate(stores, shops, places) == {"konzum:9": [45.491, 18.675, 0]}


def test_a_shop_far_from_the_town_is_not_used():
    stores = {"konzum": [{"id": "5", "address": "Ulica Kralja Zvonimira 2", "city": "Selce", "zip": ""}]}
    shops = [shop("Konzum", 43.5, 16.4, "Kralja Zvonimira", "2")]  # Split, not Selce
    places = [place("Selce", 45.157, 14.720)]
    assert locate(stores, shops, places) == {"konzum:5": [45.157, 14.72, 0]}


def test_add_locations_and_dump():
    stores = [{"id": "1", "address": "a", "city": "b", "zip": ""}, {"id": "2", "address": "c", "city": "d", "zip": ""}]
    out = add_locations(stores, "spar", {"spar:1": [45.1, 15.2, 1], "spar:2": [45.3, 15.4, 0]})
    assert out[0] == {**stores[0], "lat": 45.1, "lon": 15.2}
    assert out[1] == {**stores[1], "lat": 45.3, "lon": 15.4, "approx": True}
    assert dump_locations({"b:1": [1, 2, 0], "a:1": [3, 4, 1]}) == '{\n  "a:1": [3, 4, 1],\n  "b:1": [1, 2, 0]\n}\n'
