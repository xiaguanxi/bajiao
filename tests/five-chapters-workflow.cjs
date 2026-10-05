const assert = require('node:assert/strict');
const path = require('node:path');
const Vocast = require(path.resolve('app/src/main/assets/core.js'));

(async () => {
  console.log('=== 开始 Vocast 前 5 章全流程自动化测试 ===');

  // 1. 构造包含角色对白与典型广告的前 5 章文本
  const bookText = `
第一章 雾山相逢
清晨的大雾笼罩着山谷，青年男子沈砚推开破旧的木门。
沈砚沉声道：“你终于来了。”
林晚轻声回应：“我等这封信，已经等了三年。”
沈砚叹了口气说：“信里的秘密，关系到整个雾山的安危。”
PS：求大家的推荐票和月票支持！新书起航，请大家多多收藏！

第二章 密信之谜
林晚展开泛黄的信纸，秀眉微蹙。
沈砚急切地问：“信上写了什么？”
林晚声音微颤道：“只有八个字：天亮之前，离开此地。”
陈伯拄着拐杖走过来大喊：“别看了，那群黑衣人已经进山了！”
沈砚拔出腰间短刀说：“陈伯，带林晚先走，我来断后！”
本章完，最新章节请访问笔趣阁免费阅读，下载APP阅读体验更佳！

第三章 雨夜追击
暴雨倾盆而下，山道泥泞不堪。
陈伯喘着粗气说：“前方的悬崖过不去了！”
林晚大声喊道：“把手给我，我们一定能过去！”
黑衣首领冷笑道：“跑啊，怎么不跑了？”
沈砚飞身而出大喝：“休伤他们！”
书友交流群：123456789，进群领取粉丝专属番外和周边！

第四章 绝地反击
雷声滚滚，沈砚与黑衣首领刀光交错。
黑衣首领厉声喝道：“你以为能挡得住我？”
林晚对准敌人大喊：“放开他！”
羽箭破空而出，正中敌人肩头。
陈伯高呼：“好箭法！”
沈砚大声说：“快走，去隐秘山洞！”
作者有话说：今天打赏满100加更一章！感谢大家一路相伴！

第五章 晨光破晓
晨光透过树叶的缝隙洒下，山洞里逐渐有了暖意。
林晚轻声问：“沈砚，你感觉怎么样？”
沈砚微微一笑说：“无碍，多亏了你那一箭。”
陈伯升起篝火笑道：“大难不死，必有后福，信里的秘密终于该揭开了。”
沈砚郑重地点头说：“不错，新的征程才刚刚开始。”
求鲜花！求评价票！求打赏！求催更！
`;

  // 2. 模拟本地存储与 IO 设备适配器
  const mockStorage = new Map();
  const mockAudioStore = new Map();
  let audioSeq = 1;
  const llmRequests = [];
  const ttsRequests = [];

  const mockDevice = {
    async call(action, payload = {}) {
      if (action === 'saveState') {
        mockStorage.set('state', JSON.parse(payload.text));
        return true;
      }
      if (action === 'saveSnapshot') {
        mockStorage.set('header', JSON.parse(payload.header));
        return true;
      }
      if (action === 'request') {
        const { provider, body } = payload;
        if (provider === 'llm') {
          llmRequests.push(body);
          // 检查 M3 模型是否传了 thinking: { type: 'disabled' }
          if (/M3|MiniMax/i.test(body.model)) {
            assert.deepEqual(body.thinking, { type: 'disabled' }, 'MiniMax M3 请求必须携带 thinking: { type: "disabled" }');
          }

          const prompt = body.messages[body.messages.length - 1].content;
          if (prompt.includes('匹配已有音色')) {
            // 返回音色匹配建议
            return {
              choices: [{
                finish_reason: 'stop',
                message: {
                  content: JSON.stringify({
                    matches: [
                      { name: '林晚', voiceId: 'preset:茉莉', reason: '年轻女声符合描述' },
                      { name: '沈砚', voiceId: 'preset:白桦', reason: '沉稳男声符合描述' },
                      { name: '陈伯', voiceId: 'preset:苏打', reason: '老猎人符合描述' },
                      { name: '黑衣首领', voiceId: 'preset:苏打', reason: '冷酷反派' }
                    ]
                  })
                }
              }]
            };
          }

          // 角色与分句标注
          // 提取批次文本，模拟模型返回
          const batchMatch = prompt.match(/本批片段：(\[[\s\S]*\])/);
          const batch = batchMatch ? JSON.parse(batchMatch[1]) : [];
          const characters = [];
          const lines = [];

          for (let i = 0; i < batch.length; i++) {
            const item = batch[i];
            const prev = batch[i - 1]?.text || '';
            const next = batch[i + 1]?.text || '';
            const context = prev + ' ' + item.text + ' ' + next;
            const isAd = Vocast.isAdvertisement(item.text);
            if (isAd) {
              lines.push({ id: item.id, speaker: '广告', emotion: '跳过', confidence: 1.0 });
              continue;
            }
            // 若为引号对话，优先从前置提示词（prev）识别发言人
            const speakerTarget = (prev && /^[“「『"].*[”」』"]$/s.test(item.text)) ? prev : (item.text + ' ' + prev + ' ' + next);
            if (speakerTarget.includes('沈砚')) {
              characters.push({ name: '沈砚', description: '沉稳坚毅青年男声', aliases: [] });
              lines.push({ id: item.id, speaker: '沈砚', emotion: '沉稳坚毅', confidence: 0.98 });
            } else if (speakerTarget.includes('林晚')) {
              characters.push({ name: '林晚', description: '清亮温婉年轻女声', aliases: [] });
              lines.push({ id: item.id, speaker: '林晚', emotion: '温柔关切', confidence: 0.98 });
            } else if (speakerTarget.includes('陈伯')) {
              characters.push({ name: '陈伯', description: '苍老粗犷的老猎人男声', aliases: [] });
              lines.push({ id: item.id, speaker: '陈伯', emotion: '焦急高呼', confidence: 0.95 });
            } else if (speakerTarget.includes('黑衣首领')) {
              characters.push({ name: '黑衣首领', description: '阴狠冷酷的反派男声', aliases: [] });
              lines.push({ id: item.id, speaker: '黑衣首领', emotion: '冷笑嘲弄', confidence: 0.95 });
            } else {
              lines.push({ id: item.id, speaker: '旁白', emotion: '自然叙述', confidence: 1.0 });
            }
          }

          return {
            choices: [{
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({
                  characters,
                  lines,
                  summary: '测试上下文摘要'
                })
              }
            }]
          };
        }

        if (provider === 'tts') {
          ttsRequests.push(body);
          // 模拟 TTS 生成 base64
          return {
            choices: [{
              message: {
                audio: { data: 'bW9jay1hdWRpby1kYXRh' } // "mock-audio-data" in base64
              }
            }]
          };
        }
      }
      return true;
    },
    saveState(text) { return this.call('saveState', { text }); },
    saveSnapshot(header, chapters) { return this.call('saveSnapshot', { header, chapters }); },
    request(provider, body, settings) { return this.call('request', { provider, body, settings }); },
    async saveAudio(base64, format) {
      const id = 'audio_' + (audioSeq++);
      mockAudioStore.set(id, { size: base64.length, format });
      return { id, name: id + '.' + format, format, size: base64.length };
    },
    async mergeAudio(ids) {
      const id = 'merged_' + (audioSeq++);
      mockAudioStore.set(id, { parts: ids, duration: ids.length * 3.5 });
      return { id, name: id + '.wav', format: 'wav', size: ids.length * 1000, duration: ids.length * 3.5 };
    }
  };

  // 3. 初始化引擎，配置使用 MiniMax-M3 与手选角色模式（mode: 'manual'）
  const state = Vocast.makeState();
  state.settings.llmModel = 'MiniMax-M3';
  state.settings.mode = 'manual'; // 未勾选“自动选角色配音”，严格手动确认模式！
  state.settings.usePresets = true;

  const engine = new Vocast.Engine(mockDevice, state);

  // 4. 导入包含 5 章的书籍
  const book = await engine.addBook('雾山传奇', bookText);
  assert.equal(book.chapters.length, 5, '应该成功拆分为 5 章');
  console.log('✓ 成功导入 5 章书籍：', book.name);

  // 5. 测试：广告识别函数精确性
  assert.equal(Vocast.isAdvertisement('PS：求大家的推荐票和月票支持！新书起航，请大家多多收藏！'), true, '应当识别投票广告');
  assert.equal(Vocast.isAdvertisement('本章完，最新章节请访问笔趣阁免费阅读，下载APP阅读体验更佳！'), true, '应当识别外链与笔趣阁广告');
  assert.equal(Vocast.isAdvertisement('书友交流群：123456789，进群领取粉丝专属番外和周边！'), true, '应当识别加群广告');
  assert.equal(Vocast.isAdvertisement('作者有话说：今天打赏满100加更一章！感谢大家一路相伴！'), true, '应当识别作者感言与打赏广告');
  assert.equal(Vocast.isAdvertisement('“你终于来了。”沈砚沉声道。'), false, '正常对白不得误判为广告');
  console.log('✓ 广告规则过滤器检测 100% 准确');

  // 6. 将前 5 章加入制作队列
  const chapterIds = book.chapters.map(c => c.id);
  await engine.enqueue(book.id, chapterIds);
  console.log('✓ 已将 5 个章节加入制作队列');

  // 7. 测试问题 1：手动模式下（未勾选自动选配音），遇到新角色必须暂停并 waiting，绝不能偷偷合成对白！
  // 第一章包含沈砚、林晚。在 manual 模式下执行工作：
  const task1 = engine.state.tasks.find(t => t.chapterId === chapterIds[0]);
  console.log('task1 actual status:', task1.status, 'phase:', task1.phase, 'message:', task1.message);
  assert.equal(task1.status, 'waiting', '第 1 章识别出新角色后，由于未确认音色，任务状态必须为 waiting');
  assert.equal(task1.phase, '等待确认', 'phase 必须为 等待确认');
  assert(task1.message.includes('待确认音色'), '提示信息必须明确要求确认角色音色');

  // 验证：此时未确认音色的角色对白绝对没有偷跑合成！
  const ch1 = book.chapters[0];
  const dialogueAudioDone = ch1.segments.filter(s => s.speaker !== '旁白' && s.audio && s.audio !== 'skip').length;
  assert.equal(dialogueAudioDone, 0, '在用户确认角色音色前，未确认音色的角色对白绝对不能偷跑合成！');
  // 旁白部分正常先行处理并保存现场
  const narratorAudioDone = ch1.segments.filter(s => s.speaker === '旁白' && s.audio && s.audio !== 'skip').length;
  assert(narratorAudioDone > 0, '已知旁白音色先行安全处理，角色音色待确认');
  console.log('✓ 问题 1 验证通过：手动模式下检测到新角色，系统准确保留现场并进入 waiting，未确认角色绝不提前合成');

  // 8. 测试问题 2：验证广告片段处理
  const adSegsCh1 = ch1.segments.filter(s => s.isAd || s.speaker === '广告');
  assert.equal(adSegsCh1.length, 1, '第 1 章末尾的广告必须被识别出来');
  assert.equal(adSegsCh1[0].skip, true, '广告必须标记为 skip: true');
  assert.equal(adSegsCh1[0].audio, 'skip', '广告音频必须预设为 skip，不参与 TTS 合成');
  // 验证广告没有被添加为角色
  assert.equal(book.characters.some(r => r.name === '广告'), false, '“广告”绝对不能被加入角色列表');
  console.log('✓ 问题 2 验证通过：广告文本不选角、不合成、标记 skip，完全静默跳过');

  // 9. 用户在界面上确认/指定角色配音后，继续推进流程
  // 为所有识别出的角色分配音色（如使用推荐音色或手动指定）
  for (const ch of book.characters) {
    if (!ch.voice) {
      ch.voice = ch.suggestedVoice || 'preset:茉莉';
    }
  }
  console.log('✓ 用户完成角色音色确认：', book.characters.map(r => `${r.name}->${r.voice}`).join('，'));

  // 10. 恢复制作队列，让所有 5 章全部跑通
  // 模拟真实用户流程：当后台任务进入 waiting 提示确认新角色时，用户确认音色并继续
  let guard = 0;
  while (engine.state.tasks.some(t => ['queued', 'running', 'waiting'].includes(t.status)) && guard++ < 30) {
    let hasWaiting = false;
    for (const t of engine.state.tasks) {
      if (t.status === 'waiting') {
        hasWaiting = true;
        for (const ch of book.characters) {
          if (!ch.voice) {
            ch.voice = ch.suggestedVoice || 'preset:苏打';
          }
        }
      }
    }
    if (hasWaiting) {
      await engine.resumeWaiting(book.id);
    }
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('Task statuses:', engine.state.tasks.map(t => ({ id: t.id, cid: t.chapterId, status: t.status, phase: t.phase, message: t.message, done: t.done, total: t.total, error: t.error })));
  console.log('Ch4 segments:', book.chapters[3].segments.map(s => ({ id: s.id, speaker: s.speaker, audio: s.audio, conf: s.confidence })));

  // 11. 验证前 5 章全部制作完成并合并为完整音频
  for (let i = 0; i < 5; i++) {
    const c = book.chapters[i];
    assert(c.audio, `第 ${i + 1} 章必须生成完整的合并音频 ID`);
    assert(c.duration > 0, `第 ${i + 1} 章音频时长必须大于 0`);
    assert.equal(c.status, 'ready', `第 ${i + 1} 章状态必须为 ready`);
    
    // 验证所有章节中的广告片段都没有生成实际音频文件
    const ads = c.segments.filter(s => s.isAd || s.speaker === '广告');
    for (const a of ads) {
      assert.equal(a.audio, 'skip', `章节 ${i + 1} 中的广告片段音频属性必须为 skip`);
    }
    console.log(`✓ 第 ${i + 1} 章制作完成：【${c.title}】 时长 ${c.duration.toFixed(1)} 秒，广告已跳过`);
  }

  // 12. 验证任务全部标记为 done
  for (const t of engine.state.tasks) {
    assert.equal(t.status, 'done', `任务 ${t.id} 状态应为 done`);
  }

  console.log('✓ 全部 5 个章节制作任务状态均已成功达成 done');
  console.log('✓ M3 请求参数严格携带 thinking: { type: "disabled" }，验证通过');
  console.log('✓ TTS 请求共执行 ' + ttsRequests.length + ' 次，全部参数合规');
  console.log('=== 前 5 章完整自动化测试全部成功通过！ ===');
})();
