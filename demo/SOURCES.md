# Photo sources

Every photo in `demo/` and `eval/images/` is CC0 (public-domain dedication) on Wikimedia Commons.
No real-estate listing photos or other copyrighted images. Files were downloaded at 1920px wide.

| File | Commons page | Author | Licence |
|---|---|---|---|
| `demo/bathroom-1.jpg` | [Very small bathroom in Karlsruhe, Germany](https://commons.wikimedia.org/wiki/File:Very_small_bathroom_in_Karlsruhe,_Germany.jpg) | Lmqay | CC0 |
| `demo/bedroom-1.jpg` | [Bedroom in a serviced apartment in London](https://commons.wikimedia.org/wiki/File:Bedroom_in_a_serviced_apartment_in_London.jpg) | Mx. Granger | CC0 |
| `eval/images/living-staged-shop.jpg` | [Furnished living room. (Unsplash)](https://commons.wikimedia.org/wiki/File:Furnished_living_room._(Unsplash).jpg) | Stephen Di Donato | CC0 (Unsplash, pre-2017 CC0 era) |
| `eval/images/bathroom-historic.jpg` | [Belleville, Ontario - Glanmore museum - second floor - bathroom](https://commons.wikimedia.org/wiki/File:Belleville,_Ontario_-_Glanmore_museum_-_second_floor_-_bathroom.jpg) | Cantons-de-l'Est | CC0 |
| `demo/living-1.jpg` | [Living room (Unsplash)](https://commons.wikimedia.org/wiki/File:Living_room_(Unsplash).jpg) | Jarosław Ceborski | CC0 |

Note: `living-staged-shop.jpg` looks like a shop staged as a living room (Muse Spark flags it `not_a_room`), so it is kept as an eval edge case. It carries an old embedded EXIF "All rights reserved" string from the photographer's editing app; Commons lists it as CC0 via Unsplash's 2016 licence. The pipeline strips EXIF anyway. Swap it out if in doubt.
