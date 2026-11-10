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
LEAD_IN = 0.5  # seconds of still first frame before the animation starts


def encode(frames: Path) -> tuple[Path, Path]:
    mp4 = frames.with_suffix('.mp4')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '30', '-i', str(frames / 'f%05d.jpg'),
                    '-vf', f'tpad=start_duration={LEAD_IN}:start_mode=clone',
                    '-c:v', 'libx264', '-profile:v', 'main', '-level', '4.0', '-preset', 'slow', '-crf', '21',
                    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(mp4)], check=True)
    poster = sorted(frames.glob('f*.jpg'))[0]   # PowerPoint shows the poster until playback starts
    return mp4, poster


def autoplay(slide, spid: int, dur_ms: int) -> None:
    """Replace python-pptx's click-to-play timing with play-on-entry."""
    sld = slide._element
    # a click on a full-bleed video must advance the slide, not pause the video
    A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
    for h in sld.iter(f'{{{A}}}hlinkClick'):
        if h.get('action') == 'ppaction://media':
            h.getparent().remove(h)
    for old in sld.findall(f'{{{P}}}timing') + sld.findall(f'{{{P}}}transition'):
        sld.remove(old)
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
    # schema order: cSld, clrMapOvr, timing, extLst (no transition: playback must start immediately)
    ext = sld.find(f'{{{P}}}extLst')
    if ext is not None:
        ext.addprevious(timing)
    else:
        sld.append(timing)


def main(capdir: str, out: str) -> None:
    cap = Path(capdir)
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(12192000), Emu(6858000)  # 16:9
    blank = prs.slide_layouts[6]
    for frames in sorted(p for p in cap.iterdir() if p.is_dir() and p.name.startswith('s')):
        mp4, poster = encode(frames)
        dur_ms = int((len(list(frames.glob('f*.jpg'))) / 30 + LEAD_IN) * 1000)
        slide = prs.slides.add_slide(blank)
        movie = slide.shapes.add_movie(str(mp4), 0, 0, prs.slide_width, prs.slide_height,
                                       poster_frame_image=str(poster), mime_type='video/mp4')
        movie.name = f'Slide animation {frames.name[1:]}'
        autoplay(slide, movie.shape_id, dur_ms)
        print(frames.name, mp4.stat().st_size // 1024, 'KB')
    prs.save(out)
    hide_media_controls(out)
    print('saved', out, Path(out).stat().st_size // 1024, 'KB')


def hide_media_controls(path: str) -> None:
    """Slide show: no media control bar on mouse-over (presProps showPr@showMediaCtrls=0)."""
    import shutil
    import tempfile
    import zipfile
    tmp = tempfile.mktemp(suffix='.pptx')
    with zipfile.ZipFile(path) as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == 'ppt/presProps.xml':
                root = etree.fromstring(data)
                show = root.find(f'{{{P}}}showPr')
                if show is None:
                    show = etree.Element(f'{{{P}}}showPr')
                    root.insert(0, show)
                show.set('showMediaCtrls', '0')
                data = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
            zout.writestr(item, data, compress_type=zipfile.ZIP_STORED if item.filename.endswith(('.mp4', '.jpg')) else zipfile.ZIP_DEFLATED)
    shutil.move(tmp, path)


if __name__ == '__main__':
    main(*sys.argv[1:3])
