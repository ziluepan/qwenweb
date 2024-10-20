export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 通过 sessionStorage 存储聊天历史
    const chatHistory = JSON.parse(ctx.chatHistory || '[]'); // 获取聊天历史，若没有则为空数组

    if (url.pathname === "/chat") {
      if (request.method === "POST") {
        const body = await request.json();
        const userMessage = body.message;
        const selectedModel = body.model;
        const enableSearch = body.enable_search; // 只在启用搜索时传递这个字段

        // 组装请求体
        const requestBody = {
          model: selectedModel,
          messages: [
            { role: "system", content: "You are a helpful assistant." },
            ...chatHistory, // 将历史消息添加到请求体
            { role: "user", content: userMessage }
          ]
        };

        // 如果 enable_search 为 true，才添加这个字段
        if (enableSearch) {
          requestBody.enable_search = true;
        }

        // 调用 Qwen API 获取回复
        const qwenResponse = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.DASHSCOPE_API_KEY}`, // 使用环境变量存储 API key
          },
          body: JSON.stringify(requestBody)
        });

        const qwenData = await qwenResponse.json();
        console.log("Qwen API Response:", qwenData);

        if (qwenData.choices && qwenData.choices.length > 0) {
          // 更新聊天历史
          chatHistory.push({ role: "user", content: userMessage });
          chatHistory.push({ role: "assistant", content: qwenData.choices[0].message.content });
          ctx.chatHistory = JSON.stringify(chatHistory); // 保存更新的聊天历史到上下文

          return new Response(JSON.stringify({
            response: qwenData.choices[0].message.content,
          }), {
            headers: { "Content-Type": "application/json" }
          });
        } else {
          return new Response(JSON.stringify({
            error: "Invalid response from Qwen API"
          }), {
            headers: { "Content-Type": "application/json" }
          });
        }
      } else if (request.method === "DELETE") {
        // 清除聊天历史
        ctx.chatHistory = null; // 清除后端的聊天历史
        return new Response(JSON.stringify({ message: "Chat history cleared" }), {
          headers: { "Content-Type": "application/json" }
        });
      } else {
        return new Response("Only POST and DELETE requests are allowed", { status: 405 });
      }
    }

    // 静态网页部分
    return new Response(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Qwen Chat</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .chat-box { max-width: 600px; margin: auto; }
            .message { margin: 10px 0; }
            .message.user { color: blue; }
            .message.qwen { color: green; }
            textarea { width: 100%; height: 60px; resize: none; }
            select, button { margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="chat-box">
            <div id="chat"></div>
            <select id="model-select">
              <option value="qwen2.5-72b-instruct">qwen2.5-72b-instruct</option>
              <option value="qwen2.5-math-72b-instruct">qwen2.5-math-72b-instruct</option>
              <option value="qwen2.5-math-7b-instruct">qwen2.5-math-7b-instruct</option>
              <option value="qwen2.5-coder-7b-instruct">qwen2.5-coder-7b-instruct</option>
            </select>
            

            <textarea id="message-input" placeholder="Type your message here..."></textarea>
            

            <label>
              <input type="checkbox" id="search-web"> Search Web
            </label>
            

            <button id="send-btn">Send</button>
            <button id="clear-history-btn">Clear Chat History</button> <!-- 新增清除聊天历史按钮 -->
          </div>
          <script>
            const chatBox = document.getElementById('chat');
            const input = document.getElementById('message-input');
            const sendBtn = document.getElementById('send-btn');
            const modelSelect = document.getElementById('model-select');
            const searchWebCheckbox = document.getElementById('search-web');
            const clearHistoryBtn = document.getElementById('clear-history-btn');

            // 初始化聊天历史
            let chatHistory = JSON.parse(sessionStorage.getItem('chatHistory')) || [];

            // 显示历史消息
            chatHistory.forEach(message => {
              chatBox.innerHTML += '<div class="message ' + (message.role === 'user' ? 'user' : 'qwen') + '">' + message.content + '</div>';
            });

            // 发送消息函数
            async function sendMessage() {
              const message = input.value.trim();
              const selectedModel = modelSelect.value;
              const enableSearch = searchWebCheckbox.checked; // 获取搜索功能是否开启
              if (!message) return;

              // 用户消息显示
              chatBox.innerHTML += '<div class="message user">' + message + '</div>';
              input.value = '';

              // 组装请求体
              const requestBody = { message, model: selectedModel };
              if (enableSearch) {
                requestBody.enable_search = true; // 只有在开启搜索时才传递
              }

              // 发送消息到 Worker
              const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
              });
              const data = await response.json();

              // Qwen 回复显示
              chatBox.innerHTML += '<div class="message qwen">' + data.response + '</div>';

              // 更新聊天历史
              chatHistory.push({ role: "user", content: message });
              chatHistory.push({ role: "assistant", content: data.response });
              sessionStorage.setItem('chatHistory', JSON.stringify(chatHistory)); // 保存到 sessionStorage
            }

            // 清除聊天历史函数
            async function clearChatHistory() {
              chatHistory = []; // 清空聊天历史数组
              sessionStorage.removeItem('chatHistory'); // 清除存储的聊天历史
              chatBox.innerHTML = ''; // 清空聊天框

              // 发送 DELETE 请求清除后端的聊天历史
              await fetch('/chat', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
              });
            }

            // 按下 Enter 键发送消息
            input.addEventListener('keydown', (event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault(); // 阻止换行
                sendMessage();          // 调用发送消息函数
              }
            });

            // 点击按钮发送消息
            sendBtn.addEventListener('click', () => sendMessage());

            // 点击按钮清除聊天历史
            clearHistoryBtn.addEventListener('click', clearChatHistory);
          </script>
        </body>
      </html>
    `, { headers: { "Content-Type": "text/html" } });
  },
};
