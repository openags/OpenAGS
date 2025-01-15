import os
import asyncio
import yaml
from autogen import AssistantAgent, UserProxyAgent, ConversableAgent

class GSAgent(ConversableAgent):
    def __init__(self, name, llm_config):
        super().__init__(
            name=name,
            system_message="You are a helpful AI Assistant.",
            llm_config=llm_config,
            human_input_mode="NEVER"
        )
        self.type = "GSAgent"


    async def a_generate_reply(self, messages=None):
        reply = await super().a_generate_reply(messages)
        return reply


if __name__ == "__main__":
    # 读取 YAML 配置文件
    with open(os.path.join("config", "config.yml"), "r") as f:
        config = yaml.safe_load(f)

    agent_name = "GSAgent"
    llm_config = config['agents'].get(agent_name)

    agent = GSAgent(agent_name, llm_config)

    async def main():
        reply = await agent.a_generate_reply([{"content": "Give me investment suggestion in 3 bullet points.", "role": "user"}])
        print(reply)

    asyncio.run(main())