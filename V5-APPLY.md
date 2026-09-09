# MacroDeck V5 적용 순서

1. 배포 키트에서 `UPLOAD-V5.cmd`를 더블클릭합니다.
2. GitHub 인증 창이 나오면 `ko9ma7` 계정으로 승인합니다.
3. 업로드가 끝난 뒤 GitHub `Actions` 탭에서 자동 배포 성공 여부를 확인합니다.
4. `Collect market data and deploy MacroDeck → Run workflow → backfill`을 한 번 실행합니다.
5. backfill이 성공하면 `snapshot`을 한 번 실행합니다.
6. GitHub Pages에서 `Ctrl + Shift + R`로 강력 새로고침합니다.

V5 업로더는 기존 `public/data`를 우선 보존합니다. 저장소에 데이터가 전혀 없는 경우에만 V5 seed data를 채웁니다.
