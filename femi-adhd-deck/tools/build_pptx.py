"""Build the animated PowerPoint from captured frames.

usage: python3 tools/build_pptx.py <capdir> <out.pptx>

Each slide = one full-bleed MP4 (the slide's own entrance animation, captured
frame by frame from the live deck) that starts automatically when the slide
opens and holds on its last frame. The poster image is that last frame, so any
viewer that does not play video still shows the finished slide.
"""
import subprocess
import sys
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.util import Emu

P = 'http://schemas.openxmlformats.org/presentationml/2006/main'


def encode(frames: Path) -> tuple[Path, Path]:
    mp4 = frames.with_suffix('.mp4')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '30', '-i', str(frames / 'f%05d.jpg'),
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p',
                    '-movflags', '+faststart', str(mp4)], check=True)
    poster = sorted(frames.glob('f*.jpg'))[-1]
    return mp4, poster


def autoplay(slide, spid: int, dur_ms: int) -> None:
    """Replace python-pptx's click-to-play timing with play-on-entry + a fade transition."""
    sld = slide._element
    for old in sld.findall(f'{{{P}}}timing') + sld.findall(f'{{{P}}}transition'):
        sld.remove(old)
    transition = etree.fromstring(f'<p:transition xmlns:p="{P}" spd="med"><p:fade/></p:transition>')
    timing = etree.fromstring(f'''
<p:timing xmlns:p="{P}"><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>
  <p:par><p:cTn id="2" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>
    <p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>
      <p:par><p:cTn id="4" presetID="1" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="afterEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>
        <p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr><p:cTn id="5" dur="{dur_ms}" fill="hold"/><p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cBhvr></p:cmd>
      </p:childTnLst></p:cTn></p:par>
    </p:childTnLst></p:cTn></p:par>
  </p:childTnLst></p:cTn></p:par>
  <p:video><p:cMediaNode vol="80000"><p:cTn id="6" fill="hold" display="0"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl></p:cMediaNode></p:video>
</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>''')
    # schema order: cSld, clrMapOvr, transition, timing, extLst
    ext = sld.find(f'{{{P}}}extLst')
    if ext is not None:
        ext.addprevious(transition); ext.addprevious(timing)
    else:
        sld.append(transition); sld.append(timing)


def main(capdir: str, out: str) -> None:
    cap = Path(capdir)
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(12192000), Emu(6858000)  # 16:9
    blank = prs.slide_layouts[6]
    for frames in sorted(p for p in cap.iterdir() if p.is_dir() and p.name.startswith('s')):
        mp4, poster = encode(frames)
        dur_ms = int(len(list(frames.glob('f*.jpg'))) / 30 * 1000)
        slide = prs.slides.add_slide(blank)
        movie = slide.shapes.add_movie(str(mp4), 0, 0, prs.slide_width, prs.slide_height,
                                       poster_frame_image=str(poster), mime_type='video/mp4')
        movie.name = f'Slide animation {frames.name[1:]}'
        autoplay(slide, movie.shape_id, dur_ms)
        print(frames.name, mp4.stat().st_size // 1024, 'KB')
    prs.save(out)
    print('saved', out, Path(out).stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main(*sys.argv[1:3])
