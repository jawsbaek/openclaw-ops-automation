/**
 * 시나리오 2: 데이터베이스 커넥션 고갈 자동 해결
 *
 * 워크플로우:
 * 1. API 지연 알람
 * 2. SSH로 DB 서버 접속, 커넥션 현황 조회
 * 3. 커넥션 누수 원인 코드 식별
 * 4. 자동 패치 (connection.close() 누락 추가)
 * 5. PR 생성 및 자동 배포
 */

const RemoteExecutor = require('../src/ssh/remote-executor');
const LogCollector = require('../src/diagnostic/log-collector');
const PatchGenerator = require('../src/code-healer/patch-generator');
const DeployManager = require('../src/code-healer/deploy-manager');

// 설정 로드
const serversConfig = require('../config/servers.json');
const whitelistConfig = require('../config/ssh-whitelist.json');

async function dbConnectionLeakScenario() {
  console.log('=== 데이터베이스 커넥션 고갈 자동 해결 ===\n');

  const sshExecutor = new RemoteExecutor(serversConfig, whitelistConfig);
  const logCollector = new LogCollector(sshExecutor);

  // 1. API 지연 감지 (가정)
  console.log('1. API 지연 감지');
  const alert = {
    type: 'api_slow_response',
    severity: 'critical',
    metric: 'response_time',
    value: 5000, // 5초
    threshold: 500
  };
  console.log('응답 시간:', `${alert.value}ms (임계값: ${alert.threshold}ms)`);

  // 2. DB 커넥션 상태 확인
  console.log('\n2. DB 커넥션 상태 확인...');

  const dbCheckResult = await sshExecutor.execute({
    target: 'db-master.example.com',
    command: 'psql -c "SELECT count(*) FROM pg_stat_activity;"'
  });

  console.log('활성 커넥션 수:', dbCheckResult.results[0]?.stdout || 'N/A');

  // 3. 애플리케이션 로그 분석
  console.log('\n3. 애플리케이션 로그 분석...');

  const errors = await logCollector.collectErrors(
    ['web1.example.com', 'web2.example.com'],
    '/var/log/app/app.log',
    '1 hour ago'
  );

  console.log('에러 수:', errors.errorCount);

  const connectionErrors = errors.errors.filter(
    (e) => e.message.toLowerCase().includes('connection') || e.message.toLowerCase().includes('pool')
  );

  console.log('커넥션 관련 에러:', connectionErrors.length);

  if (connectionErrors.length > 0) {
    console.log('샘플 에러:', connectionErrors[0].message);
  }

  // 4. 코드 분석 - 커넥션 누수 패턴 찾기
  console.log('\n4. 코드 분석 중...');

  const evidence = [
    'Connection pool exhausted',
    'Too many connections',
    'connection.close() not called in error handler',
    'Missing finally block for connection cleanup'
  ];

  console.log('발견된 증거:');
  evidence.forEach((e) => {
    console.log('  -', e);
  });

  // 5. 자동 패치 생성
  console.log('\n5. 자동 패치 생성...');

  const patchGenerator = new PatchGenerator();

  const patch = await patchGenerator.generatePatch({
    type: 'connection_leak',
    component: 'database_pool',
    evidence,
    affectedFiles: ['src/db/query-handler.js']
  });

  console.log('패치 ID:', patch.id);
  console.log('패치 타입:', patch.pattern);
  console.log('신뢰도:', patch.confidence);

  // 패치 내용 표시
  console.log('\n생성된 패치:');
  patch.changes.forEach((change) => {
    console.log(`\n파일: ${change.file}`);
    console.log('변경 사항:');
    change.changes.forEach((c) => {
      console.log(`  라인 ${c.line}: ${c.type}`);
      console.log('  원본:', c.original);
      console.log('  수정:', c.modified);
    });
  });

  // 6. Dry-run 배포 테스트
  console.log('\n6. Dry-run 배포 테스트...');

  const deployManager = new DeployManager(sshExecutor);

  const dryRunResult = await deployManager.deployHotfix({
    patch,
    repository: {
      name: 'main-api',
      service: 'main-api.service'
    },
    strategy: 'canary',
    autoRollback: true,
    dryRun: true
  });

  console.log('[DRY-RUN] 배포 시뮬레이션 완료');
  console.log('예상 배포 단계:', dryRunResult.stages?.length || 5);

  // 7. 승인 요청 (실제 배포는 승인 필요)
  console.log('\n7. 실제 배포 승인 대기...');

  const approvalRequired = true;

  if (approvalRequired) {
    console.log('⚠️  프로덕션 배포는 수동 승인이 필요합니다.');
    console.log('승인 후 다음 명령 실행:');
    console.log(`  node deploy-approved.js ${patch.id}`);
  } else {
    // 자동 배포 (테스트 환경만)
    console.log('\n8. 테스트 환경 자동 배포...');

    const deployment = await deployManager.deployHotfix({
      patch,
      repository: {
        name: 'main-api',
        service: 'main-api.service'
      },
      strategy: 'direct',
      autoRollback: true,
      environment: 'test'
    });

    console.log('테스트 배포 완료:', deployment.status);
  }

  // 8. 배포 후 검증 (가정)
  console.log('\n9. 배포 후 검증 (시뮬레이션)...');

  // 1분 후 커넥션 수 재확인
  await new Promise((resolve) => setTimeout(resolve, 5000)); // 5초 대기 (시뮬레이션)

  const postDeployCheck = {
    before: {
      activeConnections: 495,
      responseTime: 5000
    },
    after: {
      activeConnections: 45,
      responseTime: 250
    }
  };

  console.log('배포 전:');
  console.log('  활성 커넥션:', postDeployCheck.before.activeConnections);
  console.log('  응답 시간:', `${postDeployCheck.before.responseTime}ms`);

  console.log('배포 후:');
  console.log('  활성 커넥션:', postDeployCheck.after.activeConnections);
  console.log('  응답 시간:', `${postDeployCheck.after.responseTime}ms`);

  const improvement = {
    connections: postDeployCheck.before.activeConnections - postDeployCheck.after.activeConnections,
    responseTime: postDeployCheck.before.responseTime - postDeployCheck.after.responseTime
  };

  console.log('\n개선도:');
  console.log('  커넥션 감소:', improvement.connections);
  console.log('  응답 시간 개선:', `${improvement.responseTime}ms`);

  if (improvement.connections > 0 && improvement.responseTime > 0) {
    console.log('\n🎉 커넥션 누수 해결 성공!');
  }

  // 10. PR 생성 (옵션)
  console.log('\n10. Pull Request 생성...');
  console.log('[시뮬레이션] PR 생성됨: https://github.com/company/main-api/pull/123');
  console.log('제목: [AutoPatch] Fix database connection leak in query-handler');
  console.log('설명:');
  console.log('  - Added try-finally block for connection cleanup');
  console.log('  - Ensures connection.close() is called in error path');
  console.log('  - Auto-generated by OpenClaw Ops Automation');

  // 정리
  sshExecutor.shutdown();
  console.log('\n시나리오 완료');
}

// 실행
if (require.main === module) {
  dbConnectionLeakScenario()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('시나리오 실행 오류:', err);
      process.exit(1);
    });
}

module.exports = dbConnectionLeakScenario;
