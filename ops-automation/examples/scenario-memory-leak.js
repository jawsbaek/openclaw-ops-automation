/**
 * 시나리오 1: 메모리 누수 자동 해결
 *
 * 워크플로우:
 * 1. Metrics Collector가 메모리 증가 감지
 * 2. Diagnostic Agent가 SSH로 서버 접속, 프로세스 프로파일링
 * 3. 메모리 누수 패턴 확인 (예: 캐시 미정리)
 * 4. Code Healer가 해당 코드 수정 (캐시 정리 로직 추가)
 * 5. 테스트 서버에 배포 후 검증
 * 6. 프로덕션 카나리 배포
 * 7. 메트릭 모니터링 후 완전 배포
 */

const RemoteExecutor = require('../src/ssh/remote-executor');
const Profiler = require('../src/diagnostic/profiler');
const PatchGenerator = require('../src/code-healer/patch-generator');
const DeployManager = require('../src/code-healer/deploy-manager');
const RollbackSystem = require('../src/code-healer/rollback');

// 설정 로드
const serversConfig = require('../config/servers.json');
const whitelistConfig = require('../config/ssh-whitelist.json');
const repoConfig = require('../config/code-repositories.json');

async function memoryLeakScenario() {
  console.log('=== 메모리 누수 자동 해결 시나리오 ===\n');

  // 1. SSH 연결 및 프로파일링
  console.log('1. 서버 프로파일링 중...');
  const sshExecutor = new RemoteExecutor(serversConfig, whitelistConfig);
  const profiler = new Profiler(sshExecutor);

  const profile = await profiler.profileSystem('web1.example.com', 30000);

  console.log('메모리 사용률:', `${profile.memory.summary.usagePercent}%`);
  console.log('병목 지점:', profile.bottlenecks);

  // 메모리 누수 확인
  if (profile.memory.summary.usagePercent > 85) {
    console.log('\n⚠️  높은 메모리 사용률 감지!');

    // 2. 상세 프로세스 분석
    console.log('\n2. 프로세스 상세 분석...');
    const topProcess = profile.memory.topProcesses[0];
    const processProfile = await profiler.profileProcess('web1.example.com', topProcess.pid);

    console.log('문제 프로세스:', processProfile.details);

    // 3. 로그 분석
    console.log('\n3. 로그 분석...');
    const _logResult = await sshExecutor.execute({
      target: 'web1.example.com',
      command: 'journalctl -u node-app | grep -i "cache\\|memory" | tail -50'
    });

    const evidence = ['Unbounded cache detected', 'Cache size growing indefinitely', 'No cache eviction policy'];

    console.log('증거:', evidence);

    // 4. 자동 패치 생성
    console.log('\n4. 자동 패치 생성...');
    const patchGenerator = new PatchGenerator();

    const patch = await patchGenerator.generatePatch({
      type: 'memory_leak',
      component: 'cache',
      evidence,
      affectedFiles: ['src/cache/in-memory-cache.js']
    });

    console.log('패치 생성 완료:', patch.id);
    console.log('변경 파일:', patch.files);
    console.log('신뢰도:', patch.confidence);

    // 5. 배포 계획
    console.log('\n5. 카나리 배포 시작...');
    const deployManager = new DeployManager(sshExecutor);

    try {
      const deployment = await deployManager.deployHotfix({
        patch,
        repository: repoConfig.repositories['main-api'],
        strategy: 'canary',
        autoRollback: true
      });

      console.log('\n✅ 배포 완료:', deployment.id);
      console.log('배포 단계:');
      deployment.stages.forEach((stage) => {
        console.log(`  - ${stage.name}: ${stage.status}`);
      });

      // 6. 검증
      console.log('\n6. 배포 후 검증...');
      const postProfile = await profiler.profileSystem('web1.example.com', 30000);

      console.log('배포 전 메모리:', `${profile.memory.summary.usagePercent}%`);
      console.log('배포 후 메모리:', `${postProfile.memory.summary.usagePercent}%`);

      const improvement = profile.memory.summary.usagePercent - postProfile.memory.summary.usagePercent;
      console.log('개선도:', `${improvement.toFixed(2)}%`);

      if (improvement > 0) {
        console.log('\n🎉 메모리 누수 해결 성공!');
      }
    } catch (err) {
      console.error('\n❌ 배포 실패:', err.message);

      // 7. 자동 롤백
      console.log('\n7. 자동 롤백 실행...');
      const rollbackSystem = new RollbackSystem(sshExecutor, deployManager);

      await rollbackSystem.rollback(deployment.id, err.message);

      console.log('롤백 완료');
    }
  } else {
    console.log('✅ 메모리 사용률 정상');
  }

  // 정리
  sshExecutor.shutdown();
  console.log('\n시나리오 완료');
}

// 실행
if (require.main === module) {
  memoryLeakScenario()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('시나리오 실행 오류:', err);
      process.exit(1);
    });
}

module.exports = memoryLeakScenario;
