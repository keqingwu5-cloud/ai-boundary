# 影片管線 v2

```bash
# 建議用 sound-library 的 Python（已含 soundfile / pyloudnorm / edge-tts）
/workspace/.venv-sound/bin/python /workspace/影像導演/pipeline_v2/make_episode \
  /workspace/影像導演/pipeline_v2/examples/ep08.yaml \
  --out /workspace/影像導演/pipeline_v2/test \
  --work /workspace/影像導演/pipeline_v2/test/work \
  --reuse-clips /workspace/ep08_build/clips_-15% \
  --skip-hq --until subs
```

文件：`PROMPT_RULES.md`、`UPGRADE_REPORT.md`、`templates/episode.yaml`。
