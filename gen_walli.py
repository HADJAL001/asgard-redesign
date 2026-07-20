import base64, os
p=chr(97)+chr(58)+chr(47)+chr(72)+chr(65)+chr(68)+chr(74)+chr(65)+chr(76)+chr(47)+chr(1056)+chr(1072)+chr(1073)+chr(1086)+chr(1095)+chr(1080)+chr(1081)+chr(32)+chr(1089)+chr(1090)+chr(1086)+chr(1083)+chr(47)+chr(97)+chr(115)+chr(103)+chr(97)+chr(114)+chr(100)+chr(45)+chr(114)+chr(101)+chr(100)+chr(101)+chr(115)+chr(105)+chr(103)+chr(110)+chr(47)+chr(97)+chr(112)+chr(112)+chr(47)+chr(119)+chr(97)+chr(108)+chr(108)+chr(105)+chr(45)+chr(114)+chr(111)+chr(111)+chr(109)+chr(47)+chr(112)+chr(97)+chr(103)+chr(101)+chr(46)+chr(116)+chr(115)+chr(120)
d=chr(73)+chr(121)+chr(65)+chr(105)+chr(100)+chr(88)+chr(78)+chr(108)+chr(73)+chr(71)+chr(78)+chr(115)+chr(97)+chr(87)+chr(86)+chr(117)+chr(100)+chr(67)+chr(73)+chr(55)
os.makedirs(os.path.dirname(p), exist_ok=True)
open(p,chr(119)+chr(98)).write(base64.b64decode(d+chr(0)))
