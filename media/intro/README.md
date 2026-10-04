# 소개 영상

`intro.html`은 소개 영상의 원본 애니메이션이다. 장면과 문구는 파일 안의 `COPY`(언어별 문구)와 `T`(장면별 시간, 초)에서 고친다. 로고는 `src-tauri/icons/icon.png`를 그대로 쓴다.

브라우저에서 `intro.html?lang=ko`를 열면 반복 재생되고, `intro.html?lang=ko&t=12.5`처럼 `t`를 주면 그 시점에서 멈춘다.

## 렌더링

Google Chrome과 ffmpeg가 필요하다. Chrome 위치가 다르면 `CHROME_PATH`로 지정한다.

```bash
npm install
npm run render
```

`out/`에 언어별 MP4(1080×1920, 30fps)가 생긴다. 특정 시점만 확인하려면 다음처럼 정지 화면을 `stills/`에 뽑는다.

```bash
node render.mjs ko stills 4.6,9.5,18.9
```

## 배포

MP4는 저장소에 넣지 않고 `v0.1.0-beta.1` 릴리스에 같은 이름으로 올린다. 루트 README가 이 파일들을 링크한다.

```bash
gh release upload v0.1.0-beta.1 out/Ouroborocessor-intro-*.mp4 --clobber
```

루트 README 상단 미리보기 `media/intro-ko.webp`는 한국어 영상에서 만든다(libwebp의 `img2webp` 필요).

```bash
mkdir -p frames && ffmpeg -i out/Ouroborocessor-intro-ko.mp4 -vf "fps=12,scale=360:640:flags=lanczos" frames/f%04d.png
img2webp -loop 0 -lossy -q 72 -m 6 -mixed -d 83 frames/*.png -o ../intro-ko.webp
```
