import math

def rounded_path(pts, r_frac=0.16):
    # pts: list of (x,y) polygon vertices (viewBox 0..100). Straight sides, joints
    # rounded with a quadratic bezier. r is a fraction of the shorter adjacent edge.
    n = len(pts)
    d = []
    for i in range(n):
        p_prev = pts[(i-1) % n]
        p = pts[i]
        p_next = pts[(i+1) % n]
        # vectors from p toward neighbours
        v_in = (p_prev[0]-p[0], p_prev[1]-p[1])
        v_out = (p_next[0]-p[0], p_next[1]-p[1])
        len_in = math.hypot(*v_in)
        len_out = math.hypot(*v_out)
        # trim distance capped so it never exceeds half of either edge
        t = min(r_frac*min(len_in, len_out), 0.45*len_in, 0.45*len_out)
        a = (p[0]+v_in[0]/len_in*t,  p[1]+v_in[1]/len_in*t)   # point before vertex
        b = (p[0]+v_out[0]/len_out*t, p[1]+v_out[1]/len_out*t) # point after vertex
        if i == 0:
            d.append(f"M{a[0]:.2f},{a[1]:.2f}")
        else:
            d.append(f"L{a[0]:.2f},{a[1]:.2f}")
        d.append(f"Q{p[0]:.2f},{p[1]:.2f} {b[0]:.2f},{b[1]:.2f}")
    d.append("Z")
    return " ".join(d)

shapes = {
  # slightly irregular pentagons/quads, insets leave room for rounding
  "1": [(5,16),(84,5),(96,66),(70,96),(6,84)],
  "2": [(7,7),(93,10),(88,72),(94,95),(10,90)],
  "3": [(6,10),(90,6),(95,90),(12,95)],
  "4": [(9,5),(95,18),(90,80),(40,96),(4,58)],
}
for k,v in shapes.items():
    print(f'{k}: {rounded_path(v)}')

print("\n--- objectBoundingBox (0..1) ---")
def scaled(pts, r=0.16):
    p = rounded_path(pts, r)
    import re
    return re.sub(r"-?\d+\.\d+", lambda m: f"{float(m.group())/100:.4f}", p)
for k,v in shapes.items():
    print(f'{k}: {scaled(v)}')
