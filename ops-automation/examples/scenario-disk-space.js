/**
 * 시나리오 3: 디스크 파티션 확장 및 정리
 *
 * 워크플로우:
 * 1. 디스크 90% 알람
 * 2. SSH로 파일시스템 분석
 * 3. 로그 파일 아카이빙 또는 LVM 파티션 확장
 * 4. 자동 정리 스크립트 배포
 */

const RemoteExecutor = require('../src/ssh/remote-executor');
const Profiler = require('../src/diagnostic/profiler');

// 설정 로드
const serversConfig = require('../config/servers.json');
const whitelistConfig = require('../config/ssh-whitelist.json');

async function diskSpaceScenario() {
  console.log('=== 디스크 파티션 확장 및 정리 ===\n');

  const sshExecutor = new RemoteExecutor(serversConfig, whitelistConfig);
  const profiler = new Profiler(sshExecutor);

  // 1. 디스크 알람
  console.log('1. 디스크 사용량 알람 수신');
  const alert = {
    type: 'high_disk_usage',
    severity: 'warning',
    metric: 'disk_usage_percent',
    value: 92,
    threshold: 85,
    mountPoint: '/var/log'
  };
  console.log(`디스크 사용률: ${alert.value}% (${alert.mountPoint})`);

  // 2. 디스크 프로파일링
  console.log('\n2. 디스크 상태 분석...');

  const profile = await profiler.profileDisk('web1.example.com');

  console.log('파티션 사용 현황:');
  profile.usage.forEach((disk) => {
    console.log(`  ${disk.mountPoint}: ${disk.usePercent} (${disk.used}/${disk.size})`);
  });

  // 3. 큰 파일/디렉토리 찾기
  console.log('\n3. 디스크 공간을 많이 차지하는 항목 찾기...');

  const largeItemsResult = await sshExecutor.execute({
    target: 'web1.example.com',
    command: 'du -sh /var/log/* 2>/dev/null | sort -hr | head -10'
  });

  console.log('큰 로그 디렉토리/파일:');
  if (largeItemsResult.success) {
    console.log(largeItemsResult.results[0].stdout);
  }

  // 4. 오래된 로그 파일 확인
  console.log('\n4. 오래된 로그 파일 확인...');

  const oldLogsResult = await sshExecutor.execute({
    target: 'web1.example.com',
    command: 'find /var/log -type f -mtime +30 -size +100M -exec ls -lh {} \\; 2>/dev/null | head -10'
  });

  console.log('30일 이상 된 100MB 이상 파일:');
  if (oldLogsResult.success) {
    const oldLogs = oldLogsResult.results[0].stdout.split('\n').filter((l) => l.trim());
    console.log(`발견: ${oldLogs.length}개`);
  }

  // 5. 해결 전략 선택
  console.log('\n5. 해결 전략 결정...');

  const strategies = [
    {
      name: 'log_rotation',
      description: '로그 로테이션 설정 추가/수정',
      priority: 1,
      requireApproval: false
    },
    {
      name: 'old_log_archive',
      description: '오래된 로그를 S3에 아카이빙',
      priority: 2,
      requireApproval: false
    },
    {
      name: 'log_cleanup',
      description: '30일 이상 로그 삭제',
      priority: 3,
      requireApproval: true
    },
    {
      name: 'partition_extend',
      description: 'LVM 파티션 확장',
      priority: 4,
      requireApproval: true
    }
  ];

  console.log('사용 가능한 전략:');
  strategies.forEach((s) => {
    console.log(`  ${s.priority}. ${s.name}: ${s.description} (승인: ${s.requireApproval ? '필요' : '불필요'})`);
  });

  // 6. 전략 1: 로그 로테이션 설정
  console.log('\n6. 전략 1 실행: 로그 로테이션 설정...');

  const logrotateConfig = `
/var/log/app/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 app app
    sharedscripts
    postrotate
        systemctl reload app.service > /dev/null 2>&1 || true
    endscript
}
`;

  const configResult = await sshExecutor.execute({
    target: 'web1.example.com',
    command: `echo '${logrotateConfig.replace(/'/g, "\\'")}' | sudo tee /etc/logrotate.d/app`
  });

  if (configResult.success) {
    console.log('✅ 로그 로테이션 설정 추가됨');
  }

  // 로그 로테이션 즉시 실행
  await sshExecutor.execute({
    target: 'web1.example.com',
    command: 'sudo logrotate -f /etc/logrotate.d/app'
  });

  console.log('로그 로테이션 실행 완료');

  // 7. 전략 2: 오래된 로그 아카이빙
  console.log('\n7. 전략 2 실행: 로그 아카이빙 (시뮬레이션)...');

  const _archiveScript = `
#!/bin/bash
ARCHIVE_DATE=$(date +%Y%m%d)
ARCHIVE_DIR="/tmp/log-archive-$ARCHIVE_DATE"
S3_BUCKET="s3://company-logs/archive/$(hostname)/"

mkdir -p "$ARCHIVE_DIR"

# 30일 이상 로그 찾기
find /var/log/app -type f -mtime +30 -exec mv {} "$ARCHIVE_DIR/" \\;

# 압축
tar -czf "$ARCHIVE_DIR.tar.gz" -C /tmp "log-archive-$ARCHIVE_DATE"

# S3 업로드 (aws cli 필요)
# aws s3 cp "$ARCHIVE_DIR.tar.gz" "$S3_BUCKET"

# 정리
rm -rf "$ARCHIVE_DIR" "$ARCHIVE_DIR.tar.gz"

echo "Archived logs to S3: $S3_BUCKET"
`;

  console.log('[시뮬레이션] 아카이빙 스크립트 생성');
  console.log('스크립트 경로: /usr/local/bin/archive-logs.sh');

  // 8. 전략 3: 즉시 공간 확보 (승인 필요)
  console.log('\n8. 전략 3: 즉시 공간 확보 (승인 대기)...');

  const cleanupApproval = false; // 수동 승인 필요

  if (cleanupApproval) {
    await sshExecutor.execute({
      target: 'web1.example.com',
      command: 'find /var/log -type f -mtime +30 -size +100M -delete',
      options: { requireApproval: true }
    });
    console.log('오래된 로그 삭제 완료');
  } else {
    console.log('⚠️  승인 대기 중... (실제 삭제는 승인 후 실행됨)');
  }

  // 9. 디스크 사용량 재확인
  console.log('\n9. 디스크 사용량 재확인...');

  const postProfile = await profiler.profileDisk('web1.example.com');

  const beforeUsage = 92;
  const afterUsage = parseInt(postProfile.usage.find((d) => d.mountPoint === '/var/log')?.usePercent || '85', 10);

  console.log('작업 전:', `${beforeUsage}%`);
  console.log('작업 후:', `${afterUsage}%`);
  console.log('확보된 공간:', `${beforeUsage - afterUsage}%`);

  if (afterUsage < 85) {
    console.log('\n✅ 디스크 공간 정리 성공!');
  } else {
    console.log('\n⚠️  추가 조치 필요 (파티션 확장 검토)');
  }

  // 10. 자동화 스케줄 설정
  console.log('\n10. 자동화 스케줄 설정...');

  const cronJob = '0 2 * * * /usr/local/bin/archive-logs.sh >> /var/log/archive.log 2>&1';

  console.log('[시뮬레이션] Cron 작업 추가:');
  console.log(`  ${cronJob}`);
  console.log('  → 매일 새벽 2시 로그 아카이빙 실행');

  // 11. 모니터링 알람 임계값 조정
  console.log('\n11. 모니터링 알람 임계값 조정...');

  const newThreshold = {
    warning: 80, // 이전: 85
    critical: 90 // 이전: 95
  };

  console.log('새 임계값:', newThreshold);
  console.log('→ 더 일찍 경고를 받아 여유있게 대응 가능');

  // 정리
  sshExecutor.shutdown();
  console.log('\n시나리오 완료');
  console.log('\n📊 요약:');
  console.log('  - 로그 로테이션 설정 완료');
  console.log('  - 아카이빙 스크립트 배포');
  console.log('  - 자동화 스케줄 설정');
  console.log('  - 디스크 공간 확보');
}

// 실행
if (require.main === module) {
  diskSpaceScenario()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('시나리오 실행 오류:', err);
      process.exit(1);
    });
}

module.exports = diskSpaceScenario;
