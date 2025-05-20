import os  
import yaml  
import asyncio  
from typing import AsyncGenerator, Any, Optional  

from sciagents.agents.chat_agent import ChatAgent
from sciagents.agents.message import AgentInput, Message, Role, AgentOutput
from sciagents.tools import function_tool

from gscientist.agents.base_agent import BaseAgent  
  
class GSAgent(ChatAgent, BaseAgent):  
    def __init__(self, name='GSAgent', llm_config=None, tools=None):  
        BaseAgent.__init__(self, name, llm_config)  

        # 初始化 Agent 类  
        ChatAgent.__init__(  
            self,  
            name=name,  
            llm_config=llm_config,
            tools=tools,
        )  
          
        # 初始化状态  
        self.state = {}  
  
    def log(self, message):  
        """简单的日志记录方法"""  
        print(f"[{self.name}] {message}")  
  
    def reset(self):  
        """重置代理到初始状态"""  
        self.log("Resetting ChatAgent...")  
        self.state.clear()  
        # 在这里添加任何其他需要重置的状态  
  
if __name__ == "__main__":  
    # 加载 YAML 配置文件  
    with open(os.path.join("config", "config.yml"), "r") as f:  
        config = yaml.safe_load(f)  
  

    llm_config = config['agents'].get('GSAgent')  
    llm_config={
        "model": llm_config["model"],
        "api_key": llm_config["api_key"],
        "api_base": llm_config["url"],
        **llm_config.get("model_config_dict", {})
    }

    # 创建代理  
    agent = GSAgent('GSAgent', llm_config)  
      
    # 示例 1: 非流式输出  
    print("\n=== 非流式输出 ===")  
    output = agent.step("帮我写一个python读取图片的代码，谢谢.", stream=False)  
    print(output)  

    # 示例 2: 流式输出
    output = agent.step("帮我写一个python读取图片的代码，谢谢.", stream=True)  
    print("\n=== 流式输出 ===")
    if hasattr(output.content, "__iter__") and not isinstance(output.content, str):
        # 是生成器，逐步打印
        for chunk in output.content:
            print(chunk, end="", flush=True)
        print()
    else:
        # 是字符串，直接打印
        print(output.content)
      
    # 示例 2: 异步示例  
    async def run_async_examples():  
        try:  
            # 异步流式输出  
            print("\n=== 异步流式输出 ===")  
            output = await agent.a_step("帮我写一个python读取图片的代码，谢谢.", stream=True)  
            if hasattr(output.content, "__aiter__"):  # 检查是否为异步生成器
                async for chunk in output.content:
                    print(chunk, end="", flush=True)
                print()
            elif hasattr(output.content, "__iter__") and not isinstance(output.content, str):
                for chunk in output.content:
                    print(chunk, end="", flush=True)
                print()
            else:
                print(output.content)


            # 异步非流式输出  
            print("\n=== 异步非流式输出 ===")  
            output = await agent.a_step("帮我写一个python读取图片的代码，谢谢.", stream=False)  
            if hasattr(output.content, "__aiter__"):  # 检查是否为异步生成器
                async for chunk in output.content:
                    print(chunk, end="", flush=True)
                print()
            elif hasattr(output.content, "__iter__") and not isinstance(output.content, str):
                for chunk in output.content:
                    print(chunk, end="", flush=True)
                print()
            else:
                print(output.content)



        except Exception as e:  
            print(f"Error in async examples: {str(e)}")  
      
    # 运行异步示例  
    asyncio.run(run_async_examples())