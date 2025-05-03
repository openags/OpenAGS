import os  
import yaml  
import asyncio  
from typing import AsyncGenerator, Any, Optional  

from openai.types.responses import ResponseTextDeltaEvent
from agents import Agent, Runner, RunConfig  
from agents.extensions.models.litellm_model import LitellmModel  
  
from gscientist.agents.base_agent import BaseAgent  
  
class ChatAgent(Agent, BaseAgent):  
    def __init__(self, name='ChatAgent', llm_config=None, tools=None):  
        BaseAgent.__init__(self, name)  
          
        self.type = "ChatAgent"  
        llm_config = llm_config['agents'].get(self.type)  
  
        # 确保配置中包含所需的键  
        required_keys = ["model", "api_key"]  
        for key in required_keys:  
            if key not in llm_config:  
                raise ValueError(f"Missing required configuration key: {key}")  
  
        model_name = llm_config['model']  
        api_key = llm_config['api_key']  
        
        print(f"Using model: {model_name}")
        print(f"Using API key: {api_key}")
          
        # 初始化 Agent 类  
        Agent.__init__(  
            self,  
            name=name,  
            instructions="You are a helpful assistant.",  
            model=LitellmModel(model=model_name, api_key=api_key),
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
  
    def step(self, input_data: str) -> str:
        """同步处理请求并返回字符串响应"""
        self.log(f"Processing input: {input_data}")
        result = Runner.run_sync(self, input_data)
        return result.final_output

    async def a_step(self, input_data: str) -> str:
        """异步处理请求并返回字符串响应"""
        self.log(f"Processing input asynchronously: {input_data}")
        try:
            run_config = RunConfig(tracing_disabled=True)
            result = await Runner.run(self, input_data, run_config=run_config)
            return result.final_output
        except Exception as e:
            self.log(f"Error in a_step: {str(e)}")
            raise

    async def stream_step(self, input_data: str) -> AsyncGenerator[str, None]:
        """异步流式处理请求并返回响应片段"""
        self.log(f"Streaming response for: {input_data}")
        try:
            stream_result = Runner.run_streamed(self, input_data)
            async for event in stream_result.stream_events():
                if event.type == "raw_response_event" and isinstance(event.data, ResponseTextDeltaEvent):
                    if event.data.delta:
                        yield event.data.delta
        except Exception as e:
            self.log(f"Error in stream_step: {str(e)}")
            raise

            
  
  
if __name__ == "__main__":  
    # 加载 YAML 配置文件  
    with open(os.path.join("config", "config.yml"), "r") as f:  
        config = yaml.safe_load(f)  
  
    # 创建代理  
    agent = ChatAgent('ChatAgent', config)  
      
    # 示例 1: 非流式输出  
    print("\n=== 非流式输出 ===")  
    response = agent.step("Give me investment suggestion in 3 bullet points.")  
    print(response)  
      
    # 示例 2: 异步示例  
    async def run_async_examples():  
        try:  
            # 异步流式输出  
            print("\n=== 异步流式输出 ===")  
            stream_gen = agent.stream_step("Tell me about AI research.")  
            async for chunk in stream_gen:  
                print(chunk, end="", flush=True)  
            print("\n")  
            # 异步非流式输出  
            print("\n=== 异步非流式输出 ===")  
            response = await agent.a_step("Summarize climate change impacts.")  
            print(response)  
        except Exception as e:  
            print(f"Error in async examples: {str(e)}")  
      
    # 运行异步示例  
    asyncio.run(run_async_examples())