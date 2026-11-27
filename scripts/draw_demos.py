"""Render original orthographic exercise diagrams. Coordinates are lateral, up, forward."""
from math import cos, sin, pi, radians, hypot, sqrt
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "demos" / "original"
MOVES = ["single-arm-hammer-strength-row", "lateral-raise-partials",
         "seated-dumbbell-front-raise", "seated-dumbbell-shrug", "bent-arm-lateral-raise"]


def frame(move, t):
    row, partial, front, shrug, bent = [move == name for name in MOVES]
    yaw = radians(70 if row or front else 24 if bent else 12)
    phase = (1 - cos(2*pi*t)) / 2
    im = Image.new("RGB", (320, 256), "#101928")
    d = ImageDraw.Draw(im)
    def point(v):
        x,y,z = v
        return (round(151+x*cos(yaw)+z*sin(yaw)), round(232-y+.12*(z*cos(yaw)-x*sin(yaw))))
    def joint(p, radius, color):
        x,y = point(p)
        d.ellipse((x-radius,y-radius,x+radius,y+radius), fill=color)
    def rod(a,b,width,color):
        d.line((point(a),point(b)), fill=color, width=width)
        for p in (a,b):
            joint(p,width//2,color)
    def weight(p):
        x,y,z=p
        for dx in (-8,8):
            rod((x+dx,y-5,z),(x+dx,y+5,z),6,"#9ab2cc")
        rod((x-6,y,z),(x+6,y,z),4,"#c4daeb")
    hip = 83
    d.line((35,236,285,236), fill="#344558", width=2)
    for side in (-1,1):
        x=side*17
        rod((x,0,-10),(x,hip-6,-10),5,"#536578")
        rod((x,hip-6,-16),(x,hip-6,33),10,"#566f89")
        rod((x,0,32),(x,hip-6,32),5,"#536578")
        rod((x,hip,0),(x*1.45,hip-5,46),19,"#384e66")
        rod((x*1.45,hip-5,46),(x*1.5,9,50),13,"#48647e")
        rod((x*1.5,6,47),(x*1.5,6,66),10,"#9fb1be")
    forward=13 if row else -4 if front else 0
    shoulderY=150+(10*phase if shrug else 0)
    skin="#e9bf99"
    # Machine frame and chest pad remain stationary. The near lever follows the hand.
    if row:
        rod((0,4,108),(0,53,102),8,"#516c84")
        rod((0,4,-18),(0,4,110),7,"#516c84")
        rod((0,4,47),(0,121,28),6,"#506981")
        rod((0,113,24),(0,145,21),13,"#7192aa")
    def arm(side):
        x=side*23
        sh=(x,shoulderY,forward)
        if row:
            angle=radians(24+36*(phase if side==-1 else 0))
            z=102-84*sin(angle)
            y=53+84*cos(angle)
            hand=(x,y,z)
            # Two-link arm, elbow on the lower/rear side of the shoulder-hand axis.
            dy,dz=y-shoulderY,z-forward
            dist=hypot(dy,dz)
            along=(39**2-37**2+dist**2)/(2*dist)
            height=sqrt(max(0,39**2-along**2))
            elbow=(x, shoulderY+(along*dy-height*dz)/dist, forward+(along*dz+height*dy)/dist)
            rod((x,53,102),hand,5,"#718698")
            joint((x,53,102),7,"#9cb3c6")
        else:
            angle=radians(8+87*phase if front else 7+78*phase if bent else 12+13*phase if partial else 4)
            dx,dz=(0,sin(angle)) if front else (side*sin(angle),0)
            elbow=(x+36*dx,shoulderY-36*cos(angle),forward+36*dz)
            hand=(elbow[0]+(0 if bent else 33*dx),elbow[1]-(0 if bent else 33*cos(angle)),elbow[2]+(33 if bent else 33*dz))
        rod(sh,elbow,13,skin)
        rod(elbow,hand,10,"#d7aa85")
        if not row: weight(hand)
        joint(hand,4,skin)
    # Far arm goes behind the torso in the three-quarter projection.
    arm(1)
    torso=[(-23,shoulderY,forward),(0,155,forward),(23,shoulderY,forward),
           (16,hip,0),(-16,hip,0)]
    d.polygon([point(p) for p in torso],fill="#658db0")
    rod((0,151,forward),(0,166,forward),12,skin)
    joint((0,181,forward+1),14,skin)
    joint((0,185,forward-2),12,"#394557")
    joint((0,180,forward+9),6,skin)
    arm(-1)
    return im


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for move in MOVES:
        frames=[frame(move,i/24) for i in range(24)]
        frames[0].save(OUT / (move+".gif"),save_all=True,append_images=frames[1:],
                       duration=100,loop=0,disposal=1,optimize=True)
